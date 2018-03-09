// ------------------------------------------------------------------------------------------------//
// ------------------------------------------- GLOBALS --------------------------------------------//
// ------------------------------------------------------------------------------------------------//
var trackedRecords = {}
var fieldSchema = {}
var queued = 0
var dragging = false
var pageTable = window.location.pathname.replace(/^\/|\/$/g, '')

// ------------------------------------------------------------------------------------------------//
// ------------------------------------------ PAGE INFO -------------------------------------------//
// ------------------------------------------------------------------------------------------------//
if (window.location.pathname !== '/') {
	$('#' + window.location.pathname.replace(/^\/|\/$/g, '')).addClass('active')
	document.title = document.title + ' ' + window.location.pathname.replace(/^\/|\/$/g, '')
} else { $('#' + window.location.hostname.split('.')[0]).addClass('active'); document.title = document.title + ' Home' }

// ----------------------------- Get main html and get any associated records ---------------------//
$.get('main', data => {
	$('main').html(data)
	if ($('main .db-table').length > 0) {
		$.getJSON('getFields?table=' + pageTable, fields => {
			if (fields.errno) { ThrowJSONError(fields) } else {
				fieldSchema = fields
				UpdateOpStatus(true)
				$.getJSON('getRecords?' + FieldStringFromFieldSchema(fieldSchema) + '&table=' + pageTable, jsonRecords => {
					$('.db-table > thead > tr > th').after(FieldsToHTMLHeaders(jsonRecords[0]))
					AJAXCallback(jsonRecords, RefreshCallback)
				}) 
			}
		})
	}
})

// ------------------------------------------------------------------------------------------------//
// --------------------------------------- EVENT TRACKING -----------------------------------------//
// ------------------------------------------------------------------------------------------------//
// ------------------------------------ Track dragging input --------------------------------------//
$('body').on('touchmove', '.db-table > tbody > tr > td', () => dragging = true)

// -------------------------------------- Enter table cell ----------------------------------------//
$('body').on('dblclick touchend', '.db-table > tbody > tr > td:not(.read-only, .sub-table-container)', eventArgs => {
	var cell = eventArgs.currentTarget;
	if (!dragging) {
		var id = GetCellID(cell)
		if (!trackedRecords[id]) for (let [recordID, record] of Object.entries(HTMLRowsToJSONRecords($(GetRowSelector([id]))))) { trackedRecords[recordID] = record }
		$(cell).removeClass('td-padding').html(SmartInput(cell)).children('.smart-input').focus().select()
	}
	dragging = false
})

// -------------------------------------- Leave table cell ----------------------------------------//
$('body').on('blur', '.db-table > tbody > tr > td', eventArgs => { 
	var cell = eventArgs.currentTarget
	var smartInput = $(cell).children('.smart-input')
	if (!smartInput[0].checkValidity()) { smartInput.css('outline', 'solid red 1px').focus().select(); return }

	var value = GetCellValue(smartInput[0])
	$(cell).text(value).addClass('td-padding').children('.smart-input').remove()
	
	UpdateOpStatus(true)
	$.post(	'update?table=' + pageTable, JSON.stringify({'id':[GetCellID(cell)], fields:{ [GetFieldName($(cell).index())]: value }}), updates => { AJAXCallback(updates, UpdateCallback, ResetChangeCallback, cell) }, 'json' )
})

// --------------------------------- Checked state of row icon changed ---------------------------//
$('body').on('change', '.select-toggle', eventArgs => UpdateCheckedRows(eventArgs.target))

// -------------------------------- Checked state of bulk icon changed ---------------------------//
$('body').on('change', '.bulk-select-toggle', eventArgs => $(eventArgs.target).parents('thead').siblings('tbody').children('tr:not(.sub-table-row)').find('td > .select-toggle').prop('checked', eventArgs.target.checked).change())

// ------------------------------------ Refresh icon clicked -------------------------------------//
$('body').on('click', '.refresh', () => {
	UpdateOpStatus(true)
	$.getJSON('getRecords?' + FieldStringFromFieldSchema() + '&table=' + pageTable, jsonRecords => AJAXCallback(jsonRecords, RefreshCallback))
})

// ------------------------------------ Create icon clicked --------------------------------------//
$('body').on('click', '.create', () => { UpdateOpStatus(true); $.getJSON('create?table=' + pageTable, jsonRecords => AJAXCallback(jsonRecords, CreateCallback) ) })

// ------------------------------------- Delete icon clicked -------------------------------------//
$('body').on('click', 'tr:not(.sub-table) .delete', eventArgs => { 
	var idArray = GetIDArrayFromTarget(eventArgs.currentTarget)
	if (confirm('Are you sure you want to delete these ' + idArray.length + ' record(s)?')) {
		UpdateOpStatus(true); $.post('delete?table=' + pageTable, JSON.stringify(idArray), returnedList => AJAXCallback(returnedList, DeleteCallback, null, idArray), 'json')
	}
})

// -------------------------------------- Undo icon clicked ---------------------------------------//
$('body').on('click', '.undo', eventArgs => {
	var undoQueue = GetOriginalRecordValues(GetIDArrayFromTarget(eventArgs.currentTarget))
	if (confirm('Are you sure you want to undo changes to these ' + undoQueue.length + ' record(s)?')) {
		UpdateOpStatus(true, undoQueue.length); UndoCallback(undoQueue)
	}
})

// ------------------------- Checked state of show children icon changed -------------------------//
$('body').on('change', '.show-children-toggle', eventArgs => {
	var cell = eventArgs.currentTarget
	if ($('.sub-table').length) $('.show-children-toggle, .show-kit-toggle').prop('checked', false)
	var action = 'manage'
	ToggleSubTable(cell, cell.checked, action)
	if (!cell.checked) return
	var id = $(cell).closest('tr').attr('id')
	UpdateOpStatus(true)
	$.getJSON('getRecords?table=' + pageTable + '&fields=ID&fields=Name&fields=Description&ParentID=' + id, jsonRecords => AJAXCallback(jsonRecords, SubTableCallback, null, action))
})

// -------------------------------- Select kit icon clicked ---------------------------------------//
$('body').on('change', '.show-kit-toggle', eventArgs => { 
	var cell = eventArgs.currentTarget
	if ($('.sub-table').length) $('.show-children-toggle, .show-kit-toggle').prop('checked', false)
	var action = 'edit'
	ToggleSubTable(cell, cell.checked, action)
	if (!cell.checked) return
	var id = $(cell).closest('tr').attr('id')
	var idArray = GetIDArrayFromTarget(cell)
	UpdateOpStatus(true)
	$.getJSON('getRecords?table=' + pageTable + '&fields=ID&fields=Name&fields=Description&Archived=0&ID=!' + idArray.toString() + '&ParentID=!' + idArray.toString(), jsonRecords => AJAXCallback(jsonRecords, SubTableCallback, null, action))
})

// -------------------------------- Add to kit icon clicked ---------------------------------------//
$('body').on('click', '.add-kit', eventArgs => {
	var target = $(eventArgs.currentTarget).closest('.sub-table-row').prev('tr')
	var idArray = GetIDArrayFromTarget(target)
	if (!idArray.length) return
	var parentID = $('.sub-table > tbody > tr > td > input[type="radio"]:checked').attr('id').replace(/select-kit-/, '')
	$.post('update?table=' + pageTable, JSON.stringify({ id:idArray, fields:{ParentID:parentID}}), updatedChildren => { AJAXCallback(updatedChildren, EditKitCallback) })
})

// -------------------------------- Remove from kit icon clicked ----------------------------------//
$('body').on('click', '.remove-kit', eventArgs => {
	var idArray = []
	var context = eventArgs.currentTarget
	var targets = ($(context).parentsUntil('table').last().prop('nodeName') === 'THEAD') ?
		$(context).closest('.sub-table').find('tr > td > .select-toggle:checked').closest('tr') : $(context).closest('tr')
	$(targets).each((index, rowElement) => {
		let idIndex = $(rowElement).closest('table').children('thead').children('tr').children('th').filter((index, headerElement) => {
			return $(headerElement).text() === 'ID'
		}).index()
		let id = $(rowElement).children('td').eq(idIndex).text()
		idArray.push(id)
	})
	if (idArray.length) $.post('update?table=' + pageTable, JSON.stringify({ id:idArray, fields:{ParentID:""}}), updatedChildren => { AJAXCallback(updatedChildren, EditKitCallback) })
})

// ------------------------------------------------------------------------------------------------//
// ------------------------------------------- CALLBACKS ------------------------------------------//
// ------------------------------------------------------------------------------------------------//
function AJAXCallback(jsonResults, successCallback, errorCallback = null, callbackArg = null) {
	if (jsonResults.errno) { if (errorCallback) errorCallback(jsonResults.id); ThrowJSONError(jsonResults) }
	else if (successCallback) { successCallback(jsonResults, callbackArg) }
	UpdateOpStatus(false)
}

function RefreshCallback(jsonRecords) { $('#bulk-ops-icons .bulk-select-toggle').prop('checked', false).siblings('label').removeAttr('style'); $('.db-table > tbody').html(JSONRecordsToHTMLRows(jsonRecords)); trackedRecords = {} }

function SubTableCallback(jsonRecords, action) {
	$('.sub-table > thead > tr > th').after(FieldsToHTMLHeaders(jsonRecords[0]))
	$('.sub-table > tbody').html(JSONRecordsToHTMLRows(jsonRecords, false, action))
}

function DeleteCallback(errorList, originalList) {
	$('.show-kit-toggle, .show-children-toggle').prop('checked', false).change()
	var successList = originalList.filter(originalID => errorList.indexOf(originalID) === -1)
	var parentIDIndex = GetFieldIndex('ParentID') + 1
	var parentIDList = $(GetRowSelector(successList)).find('td:nth-child(' + parentIDIndex + ')').map((index, element) => { return $(element).text() }).get()
	var parentTargets = []
	var orphanTargets = []
	$('.db-table > tbody > tr:not(.sub-table-row) > td:nth-child(' + parentIDIndex + ')').each((index, tdElement) => {
		var parentID = (IsIntField('ParentID') || IsNumberField('ParentID')) ? Number($(tdElement).text()) : $(tdElement).text() 
		if (parentIDList.indexOf($(tdElement).text()) > -1) { parentTargets.push(parentID) }
		else if (successList.indexOf(parentID) > -1) { orphanTargets.push($(tdElement).closest('tr')) }
	})

	$(GetRowSelector(successList)).remove()
	UpdateCheckedRows()
	RemoveTrackedRecords(successList, OpRemoveCondition)

	var disableParents = {}
	parentTargets.forEach(parentID => { disableParents[parentID] = (disableParents[parentID] || 0) + 1 })
	for (let [parentID, count] of Object.entries(disableParents)) {
		if (count === 1) $(GetRowSelector([parentID]) + ' > td > .show-children-toggle + label').toggleClass('disabled', true)
	}

	var idArray = []
	orphanTargets.forEach(rowElement => { idArray.push(GetCellID(rowElement)) })
	if (idArray) $.post('update?table=' + pageTable, JSON.stringify({ id:idArray, fields:{ParentID:""}}), updatedChildren => { AJAXCallback(updatedChildren, EditKitCallback) })

}

function CreateCallback(jsonRecords) {
	if ($('.db-table > tbody > tr').length === 0) { $('.db-table > tbody').html(JSONRecordsToHTMLRows(jsonRecords)) }
	else { $('.db-table > tbody > tr:last-child').after(JSONRecordsToHTMLRows(jsonRecords))}
}

function UpdateCallback(updates) {
	$('.show-kit-toggle, .show-children-toggle').prop('checked', false).change()
	updates.forEach(record => {
		for (let [key, value] of Object.entries(record)) {
			if (key === 'ID') { continue }
			else if (key === 'ParentID') {
				let state = false
				let recordParentID = value
				if (recordParentID === '') {
					let parentIDIndex = GetFieldIndex('ParentID') + 1
					recordParentID =  $(GetRowSelector([record.ID]) + ' > td:nth-child(' + parentIDIndex + ')').text()
					recordParentID = (IsIntField('ParentID') || IsNumberField('ParentID')) ?  Number(recordParentID) : recordParentID
					
					let childTargets = $('.db-table > tbody > tr:not(.sub-table-row) > td:nth-child(' + parentIDIndex + ')').filter((index, tdElement) => {
						let parentID = (IsIntField('ParentID') || IsNumberField('ParentID')) ?  Number($(tdElement).text()) : $(tdElement).text()
						return recordParentID === parentID
					})
					state = childTargets.length === 1
				}
				$(GetRowSelector([recordParentID]) + ' > td > .show-children-toggle + label').toggleClass('disabled', state)
			}

			var cell = $(GetRowSelector([record.ID])).children('td').eq(GetFieldIndex(key))
			$(cell).text(value)
			var row = GetRowSelector([record.ID])
			var undoAble = !IsReadOnlyField(GetFieldName($(cell).index())) && (RemoveTrackedRecords([record.ID], LeaveCellRemoveCondition).length === 0)
			$(row + ' .undo').toggleClass('disabled', !undoAble)
		}
		UpdateShowKit(record.ID)
	})
}

function UndoCallback(undoQueue) {
	if (undoQueue.length === 0) return
	$.post('update?table=' + pageTable, JSON.stringify(undoQueue[undoQueue.length - 1]), returnedRecords => {
		if (returnedRecords.errno) { ThrowJSONError(returnedRecords) }
		else { RemoveTrackedRecords([returnedRecords[0].ID], OpRemoveCondition, UndoRowChange) }
		undoQueue.pop()
		UpdateOpStatus(false)
		UndoCallback(undoQueue)
	}, 'json')
}

function ResetChangeCallback(id) { UndoRowChange(id, trackedRecords[id]) }

function UndoRowChange(id, originalRecord) {
	var newRecord = HTMLRowsToJSONRecords($(GetRowSelector([id])))
	newRecord = newRecord[Object.keys(newRecord)[0]]
	for (let [oldField, oldValue] of Object.entries(originalRecord)) { if (oldValue !== newRecord[oldField]) $('#' + id + ' > td:eq(' + GetFieldIndex(oldField) + ')').text(oldValue).change() }

	UpdateShowKit(id)
	var row = GetRowSelector([id])
	$(row + ' .toggle:checked').prop('checked', false).change()
	$(row + ' .undo').toggleClass('disabled', true)
}

function EditKitCallback(updates) {
	ToggleSubTable(null, false)
	UpdateCallback(updates)
	$('.select-toggle:checked').prop('checked', false).change()
}

// ------------------------------------------------------------------------------------------------//
// ------------------------------------------ CONDITIONS ------------------------------------------//
// ------------------------------------------------------------------------------------------------//
function LeaveCellRemoveCondition(id, originalRecord) {
	var newRecord = HTMLRowsToJSONRecords($(GetRowSelector([id])))
	newRecord = newRecord[Object.keys(newRecord)[0]]
	for (let eachProperty in originalRecord) { if (originalRecord[eachProperty] !== newRecord[eachProperty]) return false }
	return true
}

function OpRemoveCondition(id, originalRecord) { return id === originalRecord.ID }

// ------------------------------------------------------------------------------------------------//
// ------------------------------------------- RECORDS --------------------------------------------//
// ------------------------------------------------------------------------------------------------//
function GetIDArrayFromTarget(target) {
	var context = ($(target).parentsUntil('table').last().prop('nodeName') === 'THEAD') ? $(target).closest('table').children('tbody').children('tr:not(.sub-table-row)') : target
	var idArray = []
	if ($(context).length > 1) { $(context).find('td > .select-toggle:checked').closest('tr').each((index, element) => { idArray.push(GetCellID(element)) }) }
	else { idArray.push(GetCellID(context)) }
	return idArray
}
function GetRowSelector(idArray) {
	var rowSelector = '.db-table > tbody > '
	idArray.forEach(eachID => rowSelector += 'tr#' + eachID + ',' )
	return rowSelector.replace(/,$/, '')
}

function UpdateOpStatus(status, increment = null) {
	if (status && increment) {queued += increment } else if (status) { queued++ } else { queued-- }
	$('#queue-count > span').text(queued)
	if (queued > 0) { $('#queue-count').show() }
	else if (!queued) { $('#queue-count').hide() }
}

function UpdateShowKit(id) {
	var row = GetRowSelector([id])
	var state =	($(row).children('td').eq(GetFieldIndex('ParentID')).text() !== '') || ($(row).children('td').eq(GetFieldIndex('CanCheckOut')).text() === '1')
	$(row + ' > td > .show-kit-toggle + label').toggleClass('disabled', state)
}

function RemoveTrackedRecords(removeList, TestCondition, Callback = null) {
	var removedList = []
	removeList.forEach(removeID => {
		for (let [trackedRecordID, trackedRecord] of Object.entries(trackedRecords)) {
			if (TestCondition(removeID, trackedRecord)) { if (Callback) Callback(removeID, trackedRecord); delete trackedRecords[removeID]; removedList.push(removeID) }
		}
	})
	return removedList
}

function GetOriginalRecordValues(idArray) {
	if (Object.keys(trackedRecords).length === 0) return []
	var changedRecords = []
	idArray.forEach(id => {
		var record = HTMLRowsToJSONRecords($(GetRowSelector([id])))
		record = record[Object.keys(record)[0]]
		var fieldChanges = {}
		for (let eachProperty in record) {
			if (record[eachProperty] !== trackedRecords[id][eachProperty]) { fieldChanges[eachProperty] = trackedRecords[id][eachProperty] }
		}
		changedRecords.push( {'id':[id], 'fields':fieldChanges} )
	})
	return changedRecords
}

function UpdateCheckedRows(checkedTarget = '.db-table') {
	var headerToggle = $(checkedTarget).closest('tbody').siblings('thead').find('tr > th > .bulk-select-toggle')
	$(headerToggle).prop('checked', false)
	var headerCheckbox = $(checkedTarget).closest('tbody').siblings('thead').find('tr > th > .checkbox-icon')
	$(headerCheckbox).removeAttr('style')
	var targetRows = $(checkedTarget).closest('tbody').children('tr:not(.sub-table-row)')
	var targetRowCount = targetRows.length
	var checkedRowCount = $(targetRows).find('td:first-child > .select-toggle:checked').length
	if (checkedRowCount > 0 && checkedRowCount === targetRowCount) { $(headerToggle).prop('checked', true) }
	else if (checkedRowCount > 0 && checkedRowCount < targetRowCount) { $(headerCheckbox).css('background-image', 'url(/icons/indeterminate.svg') }
}

function ToggleSubTable(cell, state, action) {
	$('.sub-table-row').remove()
	if (state) {
		var html = '<tr class="sub-table-row"><td colspan="100%" class="sub-table-container"><table class="sub-table"><thead><tr><th>'
		if (action === 'manage') {
			html += '<input type="checkbox" id="bulk-select-all-sub-table" class="display-none bulk-select-toggle toggle">\
				<label for="bulk-select-all-sub-table" class="checkbox-icon line-icon" title="Select all items in kit"></label>\
				<img src="/icons/delete-all.svg" class="remove-kit line-icon" title="Remove all selected items from kit">'
		} else { html += '<img src="/icons/add-kit.svg" class="add-kit line-icon" title="Add selected records to selected kit">' }
		html += '</th></tr></thead><tbody></tbody></td></tr>'
		$(cell).closest('tr').after(html)
	}
}

// ------------------------------------------------------------------------------------------------//
// ------------------------------------------- HELPERS --------------------------------------------//
// ------------------------------------------------------------------------------------------------//
function ThrowJSONError(json) { alert(JSON.stringify(json)) }

function GetFieldName(index) { return $('.db-table > thead > tr > th').eq(index).text() }
function GetFieldIndex(fieldName) { return $('.db-table > thead > tr > th').filter((index, element) => { return $(element).text() === fieldName }).index() }

function IsIntField(fieldName) { return fieldSchema[fieldName].type === 'INTEGER' || fieldName.match(/q(uanti)?ty|c(ou)?nt/i) }
function IsNumberField(fieldName) { return fieldSchema[fieldName].type === 'NUMBER' || fieldName.match(/num(ber)?/i) }
function IsBoolField(fieldName) { return fieldSchema[fieldName].range === '-1,0,1' || fieldName.match(/^Is|^Can|ed$|fl(a)?g/i) }
function IsReadOnlyField(fieldName) { return fieldSchema[fieldName].readOnly }

function GetCellID(cell) { if (IsIntField('ID') || IsNumberField('ID')) return Number($(cell).closest('tr').attr('id')); return $(cell).closest('tr').attr('id') }
function GetCellValue(dataElement) {
	var fieldName = GetFieldName($(dataElement).closest('td').index())
	if (fieldSchema[fieldName]) {
		if (IsBoolField(fieldName)) { return 0 + $(dataElement).prop('checked') || Number($(dataElement).text()) }
		else if (IsIntField(fieldName) || IsNumberField(fieldName)) { return ($(dataElement).text() === 'null') ? null : Number($(dataElement).text()) }
	}
	return ($(dataElement).val() === '') ? $(dataElement).text() : $(dataElement).val()
}

function FieldsToHTMLHeaders(fields) { var html = ''; for (let eachField in fields) { html += '<th>' + eachField + '</th>' }; return html }

function FieldStringFromFieldSchema() {
	var fieldString = ''
	for ([field, value] of Object.entries(fieldSchema)) {
		if (Object.keys(value.foreignKey).length) {
			fieldString += 'fields=' + field + ',' + value.foreignKey.table + ',' + value.foreignKey.field + '&'
		} else { fieldString += 'fields=' + field + '&' }
	}
	return fieldString.replace(/&$/, '')
}

function HTMLRowsToJSONRecords(jqueryRows) {
	var jsonRecords = {}
	$(jqueryRows).each((rowIndex, row) => {
		let record = {}
		$(row).children('td').each(((dataIndex, dataElement) => { if (GetFieldName(dataIndex).trim().length) record[GetFieldName(dataIndex)] = GetCellValue(dataElement) }))
		jsonRecords[record.ID] = record
	})
	return jsonRecords
}

function JSONRecordsToHTMLRows(jsonRecords, baseRecords = true, action = null) {
	var html = ''
	var id = null
	var parentArray = jsonRecords.filter(record => record.ParentID !== null).map(record => record.ParentID)
	jsonRecords.forEach(eachRecord => {
		id = eachRecord.ID
		if (baseRecords) {
			var enableKit = ''
			if (eachRecord.ParentID !== '' | eachRecord.CanCheckOut) enableKit = 'disabled'
			var enableChildren = (parentArray.indexOf(id) > -1) ? '' : 'disabled'
			html += '<tr id="' + id + '"><td class="read-only">'
			if (fieldSchema.hasOwnProperty('ParentID')) {
				html += '<input type="checkbox" id="show-children-' + id + '" class="display-none show-children-toggle toggle">\
				<label for="show-children-' + id + '" class="line-icon ' + enableChildren + '" title="Show items in this kit"></label>'
			} else { html += '<div class="line-icon cursor-none"></div>' }
			html += '<input type="checkbox" id="bulk-select-' + id + '" class="display-none toggle select-toggle">\
				<label for="bulk-select-' + id + '" class="checkbox-icon line-icon"></label>\
				<img src="/icons/delete.svg" class="delete line-icon" title="Delete this record from the database">'
			if (fieldSchema.hasOwnProperty('ParentID')) {
				html += '<input type="checkbox" id="show-kit-' + id + '" class="display-none toggle show-kit-toggle">\
				<label for="show-kit-' + id + '" class="line-icon ' + enableKit + '" title="Show a list of items to create a kit"></label>'
			}
			html += '<img src="/icons/undo.svg" class="undo line-icon disabled" title="Undo all changes to this record"></td>'
		} else if (action === 'manage') {
			html += '<tr><td class="read-only"><input type="checkbox" id="bulk-select-sub-table-' + id + '" class="display-none toggle select-toggle">\
				<label for="bulk-select-sub-table-' + id + '" class="checkbox-icon line-icon"></label>\
				<img src="/icons/delete.svg" class="remove-kit line-icon" title="Remove this item from the kit"></td>'
		} else if (action === 'edit') {
			html += '<tr><td class="read-only"><input type="radio" id="select-kit-' + id + '" class="display-none radio" name="kit-select">\
				<label for="select-kit-' + id + '" class="radio-icon line-icon" title="Select to add this as the parent in the kit"></td>'
		} else { html += '<tr>'}
		for (let [field, value] of Object.entries(eachRecord)) {
			let readOnly = (field.includes("ID")) ? 'read-only' : ''
			html += '<td class="td-padding ' + readOnly + '">' + value + '</td>'
		}
		html += '</tr>'
	})
	return html
}

function SmartInput(cell) {
	var fieldName = GetFieldName($(cell).index())
	var type = 'text'
	var min = ''
	var max = ''
	var checked = ''
	if (fieldSchema[fieldName]) {
		if (IsBoolField(fieldName)) {
			type = 'checkbox'
			if (GetCellValue(cell)) checked = 'checked'
		} else if (IsIntField(fieldName)) {
			type = 'number'
			min = 0
		}
	}

	return '<input type="' + type + '" min="' + min + '" max="' + max + '" ' + checked + ' value="' + $(cell).text() + '" class="smart-input">'
}
