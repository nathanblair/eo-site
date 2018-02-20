// ------------------------------------------------------------------------------------------------//
// ------------------------------------------- GLOBALS --------------------------------------------//
// ------------------------------------------------------------------------------------------------//
var trackedRecords = {}
var fieldSchema = {}
var queued = 0
var dragging = false
var pageTable = window.location.pathname.replace(/^\/|\/$/g, '')

// Deleting an item will need a callback to remove its item ID from any other items' ParentID field
// Will be another update operation and needs to happen as a callback after the delete has completed
// Unsure if this belongs in server side code or client-side code?

// ------------------------------------------------------------------------------------------------//
// ------------------------------------------ PAGE INFO -------------------------------------------//
// ------------------------------------------------------------------------------------------------//
if (window.location.pathname !== '/') {
	$('#' + window.location.pathname.replace(/^\/|\/$/g, '')).addClass('active')
	document.title = document.title + ' ' + window.location.pathname.replace(/^\/|\/$/g, '')
} else {
	$('#' + window.location.hostname.split('.')[0]).addClass('active')
	document.title = document.title + ' Home'
}

// ----------------------------- Get main html and get any associated records ---------------------//
$.get('main', data => {
	$('main').html(data)
	if ($('main .db-table').length > 0) {
		$.getJSON('getFields?table=' + pageTable, function ( fields ) { if (fields.errno) { ThrowJSONError(fields) } else { fieldSchema = fields } })
		UpdateOpStatus(true);
		$.getJSON('getRecords?fields=*&table=' + pageTable, jsonRecords => { $('.db-table > thead > tr > th').after(FieldsToHTMLHeaders(jsonRecords[0])); AJAXCallback(jsonRecords, RefreshCallback)} ) 
	}
})

// ------------------------------------------------------------------------------------------------//
// --------------------------------------- EVENT TRACKING -----------------------------------------//
// ------------------------------------------------------------------------------------------------//
// ------------------------------------ Track dragging input --------------------------------------//
$('body').on('touchmove', '.db-table > tbody > tr > td', () => dragging = true)

// --------------------------------------- Edit table cell ----------------------------------------//
$('body').on('dblclick touchend', '.db-table > tbody > tr > td:not(.read-only, .sub-table-container)', eventArgs => {
	var cell = eventArgs.currentTarget;
	if (!dragging && Editable(cell)) {
		var id = GetCellID(cell)
		if (!trackedRecords[id]) {
			for (let [recordID, record] of Object.entries(HTMLRowsToJSONRecords($(GetRowSelector([id]))))) { trackedRecords[recordID] = record }
		}
		$(cell).removeClass('td-padding').html(SmartInput(cell)).children('.smart-input').focus().select()
	}
	dragging = false
})

// -------------------------------------- Leave table cell ----------------------------------------//
$('body').on('blur', '.db-table > tbody > tr > td', eventArgs => { 
	let cell = eventArgs.currentTarget
	var smartInput = $(cell).children('.smart-input')
	if (!smartInput[0].checkValidity()) { smartInput.css('outline', 'solid red 1px').focus().select(); return }

	var value = GetCellValue(smartInput[0])
	$(cell).text(value).addClass('td-padding').children('.smart-input').remove()
	
	var id = GetCellID(cell)
	if (RemoveTrackedRecords([id], LeaveCellRemoveCondition).length >= 1) {
		let undoSelector = GetRowSelector([id]) + ' .undo'
		$(undoSelector).hide()
		return
	}
	UpdateOpStatus(true)
	$.post(	'update?table=' + pageTable, JSON.stringify({'id':[id], fields:{ [GetFieldName($(cell).index())]: value }}), updates => { AJAXCallback(updates, UpdateCallback, ResetCellCallback, cell) }, 'json'
	)
})

// ------------------------------------ Table cell changed ----------------------------------------//
$('body').on('change', '.db-table > tbody > tr:not(.sub-table-row) > td:not(.read-only)', eventArgs => {
	var cell = eventArgs.currentTarget
	var row = GetRowSelector([GetCellID(cell)])
	if ($(cell).closest('tr').children('td').eq(GetFieldIndex('ParentID')).text() !== 'null') $(row + ' > .show-kit').hide()
	if (!IsReadOnlyField(GetFieldName($(cell).index()))) {
		state = GetCellValue(cell) !== trackedRecords[GetCellID(cell)][GetFieldName($(cell).index())] ? 'inline-block' : 'none'
		$(row + ' .undo').css('display', state)
	}
})

// --------------------------------- Checked state of row icon changed ---------------------------//
$('body').on('change', '.select-toggle', eventArgs => UpdateCheckedRows(eventArgs.target))

// -------------------------------- Checked state of bulk icon changed ---------------------------//
$('body').on('change', '.bulk-select-toggle', eventArgs => $(eventArgs.target).parents('thead').siblings('tbody').children('tr:not(.sub-table-row)').find('td > .select-toggle').prop('checked', eventArgs.target.checked).change())

// ------------------------------------ Refresh icon clicked -------------------------------------//
$('body').on('click', '.refresh', () => { UpdateOpStatus(true); $.getJSON('getRecords?fields=*&table=' + pageTable, jsonRecords => AJAXCallback(jsonRecords, RefreshCallback)) })

// ------------------------------------ Create icon clicked --------------------------------------//
$('body').on('click', '.create', () => { UpdateOpStatus(true); $.getJSON('create?table=' + pageTable, jsonRecords => AJAXCallback(jsonRecords, CreateCallback) ) })

// ------------------------------------- Delete icon clicked -------------------------------------//
$('body').on('click', 'tr:not(.sub-table) .delete, .delete-all', eventArgs => { 
	var idArray = GetIDsOfSelectedContext(eventArgs.currentTarget); if (idArray.length === 0) return
	if (confirm('Are you sure you want to delete these ' + idArray.length + ' record(s)?')) {
		UpdateOpStatus(true); $.post('delete?table=' + pageTable, JSON.stringify(idArray), returnedList => AJAXCallback(returnedList, DeleteCallback, null, idArray), 'json')
	}
})

// -------------------------------------- Undo icon clicked ---------------------------------------//
$('body').on('click', '.undo, .undo-all', eventArgs => {
	let undoQueue = GetOriginalRecordValues(GetIDsOfSelectedContext(eventArgs.currentTarget))
	if (undoQueue.length === 0) { alert("There are no changes to roll back for a selected record!"); return }
	if (confirm('Are you sure you want to undo changes to these ' + undoQueue.length + ' record(s)?')) { UpdateOpStatus(true, undoQueue.length); UndoCallback(undoQueue) }
})

// ------------------------- Checked state of show children icon changed -------------------------//
$('body').on('change', '.show-children-toggle', eventArgs => {
	var cell = eventArgs.currentTarget
	var action = 'manage'
	ToggleSubTable(cell, cell.checked, action)
	var id = $(cell).closest('tr').attr('id')
	UpdateOpStatus(true)
	$.getJSON('getRecords?table=' + pageTable + '&fields=Name&fields=Description&ParentID=' + id, jsonRecords => AJAXCallback(jsonRecords, SubTableCallback, null, action))
})

// -------------------------------- Select kit icon clicked ---------------------------------------//
$('body').on('click', '.show-kit-toggle, .bulk-show-kit-toggle', eventArgs => { 
	var cell = eventArgs.currentTarget
	var action = 'edit'
	ToggleSubTable(cell, cell.checked, action)
	var id = $(cell).closest('tr').attr('id')
	UpdateOpStatus(true)
	$.getJSON('getRecords?table=' + pageTable + '&fields=Name&fields=Description&ID=!' + id, jsonRecords => AJAXCallback(jsonRecords, SubTableCallback, null, action))

	// var idArray = GetIDsOfSelectedContext(eventArgs.currentTarget); if (idArray.length === 0) return
	// returnedRecord needs to be the target record to assign as a parent
	// $.post('update?table=' + pageTable, JSON.stringify({ id:idArray, fields:{ParentID:returnedRecords[0].ID}}), updatedChildren => { AJAXCallback(updatedChildren, UpdateCallback) })
})

// -------------------------------- Add to kit icon clicked ---------------------------------------//
$('body').on('click', '.add-kit', eventArgs => {
	alert('Adding selected records to selected kit!')
})


// -------------------------------- Remove from kit icon clicked ----------------------------------//
$('body').on('click', '.remove-kit, .remove-kit-all', eventArgs => { })

// ------------------------------------------------------------------------------------------------//
// ------------------------------------------- CALLBACKS ------------------------------------------//
// ------------------------------------------------------------------------------------------------//
function AJAXCallback(jsonResults, successCallback, errorCallback = null, callbackArg = null) {
	if (jsonResults.errno) { if (errorCallback) errorCallback(jsonResults); ThrowJSONError(jsonResults) }
	else if (successCallback) successCallback(jsonResults, callbackArg)
	UpdateOpStatus(false)
}

function RefreshCallback(jsonRecords) { $('#bulk-ops-icons .bulk-select-toggle').prop('checked', false).siblings('label').removeAttr('style'); $('.db-table > tbody').html(JSONRecordsToHTMLRows(jsonRecords)); trackedRecords = {} }

function SubTableCallback(jsonRecords, action) {
	$('.sub-table > thead > tr > th').after(FieldsToHTMLHeaders(jsonRecords[0]))
	$('.sub-table > tbody').html(JSONRecordsToHTMLRows(jsonRecords, false, action))
}

function DeleteCallback(errorList, originalList) {
	var successList = originalList.filter(originalID => errorList.indexOf(originalID) === -1)
	$(GetRowSelector(successList)).remove()
	UpdateCheckedRows()
	RemoveTrackedRecords(successList, OpRemoveCondition)
}

function CreateCallback(jsonRecords) {
	if ($('.db-table > tbody > tr').length === 0) { $('.db-table > tbody').html(JSONRecordsToHTMLRows(jsonRecords)) }
	else { $('.db-table > tbody > tr:last-child').after(JSONRecordsToHTMLRows(jsonRecords))}
}

function UpdateCallback(updates) {
	updates.forEach(record => {
		let row = GetRowSelector([record.ID])
		for (let [key, value] of Object.entries(record)) {
			if (key === 'ID') continue
			$(row).children('td').eq(GetFieldIndex(key)).text(value).change()
		}
	})
}

function ResetCellCallback(cell) { $(cell).text(trackedRecords[GetCellID(cell)][GetFieldName($(cell).index())]).change() }

function UndoCallback(undoQueue) {
	if (undoQueue.length === 0) return;
	$.post('update?table=' + pageTable, JSON.stringify(undoQueue[undoQueue.length - 1]), returnedRecords => {
		if (returnedRecords.errno) { ThrowJSONError(returnedRecords) }
		else { RemoveTrackedRecords([returnedRecords[0].ID], OpRemoveCondition, UndoRowChange) }
		undoQueue.pop()
		UpdateOpStatus(false)
		UndoCallback(undoQueue)
	}, 'json')
}

function UndoRowChange(id, originalRecord) {
	var newRecord = HTMLRowsToJSONRecords($(GetRowSelector([id])))
	newRecord = newRecord[Object.keys(newRecord)[0]]
	for (let [oldField, oldValue] of Object.entries(originalRecord)) {
		if (oldValue !== newRecord[oldField]) $('#' + id + ' > td:eq(' + GetFieldIndex(oldField) + ')').text(oldValue).change()
	}
	$(GetRowSelector([id]) + ' .toggle').prop('checked', false).change()
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
function GetRowSelector(idArray) {
	var rowSelector = '.db-table > tbody > '
	idArray.forEach(eachID => rowSelector += 'tr#' + eachID + ',' )
	return rowSelector.replace(/,$/, '')
}

function GetIDsOfSelectedContext(context) {
	var idArray = []
	switch ($(context).closest('tr').parent()[0].tagName) {
		case 'TBODY': idArray.push(GetCellID(context)); break;
		case 'THEAD': $('.db-table tbody tr.checked').each((index, element) => idArray.push(GetCellID(element))); break;
	}
	return idArray
}

function UpdateOpStatus(status, increment = null) {
	if (status && increment) {queued += increment } else if (status) { queued++ } else { queued-- }
	$('#queue-count > span').text(queued)
	if (queued > 0) { $('#queue-count').show() }
	else if (!queued) { $('#queue-count').hide() }
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
	checkedTarget.checked ? $(checkedTarget).closest('tr').addClass('checked') : $(checkedTarget).closest('tr').removeClass('checked')
	var headerToggle = $(checkedTarget).closest('tbody').siblings('thead').find('tr > th > .bulk-select-toggle').prop('checked', false)
	var headerCheckbox = $(checkedTarget).closest('tbody').siblings('thead').find('tr > th > .checkbox-icon').removeAttr('style')
	$(headerCheckbox).removeAttr('style')
	$(headerToggle).prop('checked', false)
	var targetRowCount = $(checkedTarget).closest('tbody').children('tr:not(.sub-table-row)').length
	var checkedRowCount = $(checkedTarget).closest('tbody').children('tr:not(.sub-table-row).checked').length
	if ((targetRowCount > 0) && ( checkedRowCount === targetRowCount)) { $(headerToggle).prop('checked', true) }
	else if (checkedRowCount > 0 && checkedRowCount < targetRowCount) { $(headerCheckbox).css('background-image', 'url(/icons/indeterminate.svg') }
}

function ToggleSubTable(cell, state, action) {
	$('.sub-table-row').remove()
	if (state) {
		var html = '<tr class="sub-table-row"><td colspan="100%" class="sub-table-container"><table class="sub-table"><thead><tr><th>'
		if (action === 'manage') {
			html += '<input type="checkbox" id="bulk-select-all-sub-table" class="display-none bulk-select-toggle">\
				<label for="bulk-select-all-sub-table" class="checkbox-icon line-icon" title="Select all items in kit"></label>\
				<img src="/icons/delete-all.svg" class="remove-all-from-kit line-icon" title="Remove all selected items from kit">'
		} else { html += '<img src="/icons/add-kit.svg" class="add-kit line-icon" title="Add selected records to selected kit">' }
		html += '</th></tr></thead><tbody></tbody></td></tr>'
		$(cell).closest('tr').after(html)
	}
}

// ------------------------------------------------------------------------------------------------//
// ------------------------------------------- HELPERS --------------------------------------------//
// ------------------------------------------------------------------------------------------------//
function Editable(element) { return !IsReadOnlyField(GetFieldName($(element).index())) }

function ThrowJSONError(json) { alert(JSON.stringify(json)) }

function GetFieldName(index) { return $('.db-table > thead > tr > th').eq(index).text() }
function GetFieldIndex(fieldName) { return $('.db-table > thead > tr > th').filter((index, element) => { return $(element).text() === fieldName }).index() }

function IsIntField(fieldName) { return fieldSchema[fieldName].type === 'INTEGER' || fieldName.match(/q(uanti)?ty|c(ou)?nt/i) }
function IsNumberField(fieldName) { return fieldSchema[fieldName].type === 'NUMBER' || fieldName.match(/num(ber)?/i) }
function IsBoolField(fieldName) { return fieldSchema[fieldName].range === '-1,0,1' || fieldName.match(/^Is|^Can|ed$|fl(a)?g/i) }
function IsReadOnlyField(fieldName) { return fieldSchema[fieldName].readOnly }
function IsParent(jsonRecords, id) {
	let returnID = jsonRecords.filter(record => { return record.ParentID === id })
	return returnID
}

function GetCellID(cell) { if (IsIntField('ID') || IsNumberField('ID')) return Number($(cell).closest('tr').attr('id')); return $(cell).closest('tr').attr('id') }
function GetCellValue(dataElement) {
	var fieldName = GetFieldName($(dataElement).closest('td').index())
	if (IsBoolField(fieldName)) { return 0 + $(dataElement).prop('checked') || Number($(dataElement).text()) }
	else if (IsIntField(fieldName) || IsNumberField(fieldName)) { return ($(dataElement).text() === 'null') ? null : Number($(dataElement).text()) }
	// Check that string isn't set to null - set return value as literal null and not just 'null'
	// TODO
	else { return ($(dataElement).val() === '') ? $(dataElement).text() : $(dataElement).val() }
}

function FieldsToHTMLHeaders(fields) { var html = ''; for (let eachField in fields) { html += '<th>' + eachField + '</th>' }; return html }

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
	var counter = 0
	var parentArray = jsonRecords.filter(record => record.ParentID !== null).map(record => record.ParentID)
	jsonRecords.forEach(eachRecord => {
		id = eachRecord.ID || counter++
		if (baseRecords) {
			html += '<tr id="' + id + '"><td class="read-only">\
				<input type="checkbox" id="bulk-apply-' + id + '" class="display-none toggle select-toggle">\
				<label for="bulk-apply-' + id + '" class="checkbox-icon line-icon"></label>\
				<img src="/icons/delete.svg" class="delete line-icon" title="Delete this record from the database">\
				<img src="/icons/undo.svg" class="undo line-icon display-none" title="Undo all changes to this record">'
			if (eachRecord.ParentID === null && !eachRecord.CanCheckOut) {
				html += '<input type="checkbox" id="show-kit-' + id + '" class="display-none toggle show-kit-toggle">\
					<label for="show-kit-' + id + '" class="line-icon" title="Add this item to another to create a kit"></label>'
			}
			if (parentArray.indexOf(id) !== -1) {
				html += '<input type="checkbox" id="show-children-' + id + '" class="display-none show-children-toggle toggle">\
					<label for="show-children-' + id + '" class="line-icon" title="Show items in this kit"></label>'
			}
			html += '</td>'
		} else if (action === 'manage') {
			html += '<tr><td class="read-only"><input type="checkbox" id="bulk-apply-sub-table-' + id + '" class="display-none toggle select-toggle">\
				<label for="bulk-apply-sub-table-' + id + '" class="checkbox-icon line-icon"></label>\
				<img src="/icons/delete.svg" class="remove-from-kit line-icon" title="Remove this item from the kit"></td>'
		} else if (action === 'edit') {
			html += '<tr><td class="read-only"><input type="radio" id="select-kit-' + id + '" class="display-none radio select-kit" name="kit-select">\
				<label for="select-kit-' + id + '" class="radio-icon line-icon" title="Select to add this as the parent in the kit"></td>'
		} else { html += '<tr>'}
		for (let [field, value] of Object.entries(eachRecord)) { html += '<td class="td-padding">' + value + '</td>' }
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

	if (IsBoolField(fieldName)) {
		type = 'checkbox'
		if (GetCellValue(cell)) checked = 'checked'
	} else if (IsIntField(fieldName)) {
		type = 'number'
		min = 0
	}

	return '<input type="' + type + '" min="' + min + '" max="' + max + '" ' + checked + ' value="' + $(cell).text() + '" class="smart-input">'
}
