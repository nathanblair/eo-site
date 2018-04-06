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
	pageTable = $('.app-table').attr('id') || pageTable
	$.getJSON('getFields?table=' + pageTable, fields => {
		if (fields.errno) { ThrowJSONError(fields); return }
		fieldSchema = fields; $('.db-table > thead > tr > th').after(FieldsToHTMLHeaders(fields)); $('.refresh').click()
	})
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
		var fieldName = GetFieldName($(cell).index())
		if (IsIndirectField(fieldName)) {
			var queryString = 'fields=' + fieldSchema[fieldName].foreignKey.field + '&fields=' + fieldSchema[fieldName].foreignKey.indirectField + WhereStringFromWhereClass(GetFieldName($(cell).index()) + '-input')
			UpdateOpStatus(true)
			$.getJSON('getRecords?table=' + fieldSchema[fieldName].foreignKey.table + '&' + queryString, jsonRecords => { AJAXCallback(jsonRecords, OpenSmartInput, null, cell) })
		} else { OpenSmartInput(null, cell) }
	}
	dragging = false
})

// -------------------------------------- Leave table cell ----------------------------------------//
$('body').on('blur', '.db-table > tbody > tr > td', eventArgs => { 
	var cell = eventArgs.currentTarget
	var smartInput = $(cell).children('.smart-input')
	if (!smartInput[0].checkValidity()) { smartInput.css('outline', 'solid red 1px').select().focus(); return }

	var value = GetCellValue(smartInput[0])
	$(cell).text(value).addClass('td-padding').children('.smart-input').remove()

	UpdateOpStatus(true)
	$.post(
		'update?table=' + pageTable,
		JSON.stringify({'id':[GetCellID(cell)], fields:{ [GetFieldName($(cell).index())]: value }, foreignKey: fieldSchema[GetFieldName($(cell).index())].foreignKey }),
		updates => { AJAXCallback(updates, UpdateCallback, ResetChangeCallback, cell) }, 'json'
	)
})

// --------------------------------- Checked state of row icon changed ---------------------------//
$('body').on('change', '.select-toggle', eventArgs => UpdateCheckedRows(eventArgs.target))

// -------------------------------- Checked state of bulk icon changed ---------------------------//
$('body').on('change', '.bulk-select-toggle', eventArgs => $(eventArgs.target).parents('thead').siblings('tbody').children('tr:not(.sub-table-row)').find('td > .select-toggle').prop('checked', eventArgs.target.checked).change())

// ------------------------------------ Refresh icon clicked -------------------------------------//
$('body').on('click', '.refresh', eventArgs => {
	UpdateOpStatus(true)
	var refreshContext = 'base'
	var whereString = WhereStringFromWhereClass('all')
	var fieldString = FieldStringFromFieldSchema()
	if ($('.app-table').length > 0) { fieldString = FieldStringFromTableHeaders(); refreshContext = 'app' }
	$.getJSON('getRecords?table=' + pageTable + fieldString + whereString, jsonRecords => AJAXCallback(jsonRecords, RefreshCallback, null, refreshContext))
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

// ------------------------------------ Check-out icon clicked ------------------------------------//
$('body').on('click', '.check-out', eventArgs => {
	var id = GetCellID(eventArgs.currentTarget)
	var checkedOutCell = $('#' + id + ' > td').eq(GetFieldIndex('CheckedOut'))
	var checkOutDateCell = $('#' + id + ' > td').eq(GetFieldIndex('ActualCheckOutDateTime'))
	var checkedOutItemID = $('#' + id + ' > td').eq(GetFieldIndex('Item')).attr('id').match(/\-(\w+)/)[1]
	checkedOutItemID = (IsIntField('Item') || IsNumberField('Item')) ? Number(checkedOutItemID) : checkedOutItemID
	$.getJSON('getRecords?table=Items&fields=ID&fields=ParentID', jsonRecords => {
		var affectedIDs = [checkedOutItemID]
		var idArray = []
		jsonRecords.forEach((record, recordIndex) => { idPair = Object.values(record); idArray.push([idPair[0], idPair[1]]) })
		affectedIDs = BuildDependencyTree(affectedIDs, idArray, checkedOutItemID)

		UpdateOpStatus(true)
		$.post('update?table=Items', JSON.stringify({ 'id':affectedIDs, fields:{ 'InStock': 0 }}), updates => {
			UpdateOpStatus(false)
			// Create an array of new affectedID's of only the ID's that were brought back as updated
			if (updates.length === affectedIDs.length) {
				var dateTime = (new Date(Date.now() - new Date().getTimezoneOffset() * 60000)).toISOString().replace(/\.[0-9]{3}Z$/, '').replace(/T/, ' ')
				UpdateOpStatus(true)
				$.post('update?table=' + pageTable, JSON.stringify({'id':[id], fields:{ 'CheckedOut': 1, 'ActualCheckOutDateTime': dateTime } }), updates => { AJAXCallback(updates, UpdateCallback, ResetChangeCallback) }, 'json' )
			}
		}, 'json')
	})
})

// ------------------------------------ Check-in icon clicked -------------------------------------//
$('body').on('click', '.check-in', eventArgs => {
	var id = GetCellID(eventArgs.currentTarget)
	var checkedInItemID = $('#' + id + ' > td').eq(GetFieldIndex('Item')).attr('id').match(/\-(\w+)/)[1]
	checkedInItemID = (IsIntField('Item') || IsNumberField('Item')) ? Number(checkedInItemID) : checkedInItemID

	UpdateOpStatus(true)
	$.getJSON('getRecords?table=Items&fields=ID&fields=ParentID&fields=IsCheckOutReusable', jsonResults => {
		UpdateOpStatus(false)
		var idArray = []
		jsonResults.forEach((record, recordIndex) => { idPair = Object.values(record); idArray.push([idPair[0], idPair[1]]) })
		var affectedIDs = BuildDependencyTree([], idArray, checkedInItemID)
		var childIDs = BuildDependencyTree([], idArray, checkedInItemID, 0)
		affectedIDs = affectedIDs.filter(eachID => childIDs.indexOf(eachID) === -1)
		var checkIn = {}
		var checkInField = (jsonResults[jsonResults.ID = checkedInItemID].IsCheckOutReusable) ? 'InStock' : 'Archived'
		checkIn[checkInField] = 1

		UpdateOpStatus(true, 4)
		$.post('update?table=Items', JSON.stringify({ 'id':childIDs, fields:{ 'InStock': 1, 'ParentID': '' }}), () => { UpdateOpStatus(false) }, 'json') 
		.done(() => { $.post('update?table=Items', JSON.stringify({ 'id':affectedIDs, fields:{ 'InStock': -1 }}), () => { UpdateOpStatus(false) }) }, 'json')
		.done(() => { $.post('update?table=Items', JSON.stringify({ 'id':[checkedInItemID], fields:checkIn}), () => { UpdateOpStatus(false) }, 'json') })
		.done(() => {
			var dateTime = (new Date(Date.now() - new Date().getTimezoneOffset() * 60000)).toISOString().replace(/\.[0-9]{3}Z$/, '').replace(/T/, ' ')
			$.post( 'update?table=' + pageTable, JSON.stringify({ 'id':[id], fields:{ 'ActualCheckInDateTime': dateTime, 'CheckedOut': 0, 'Complete': 1 }}), updates => { AJAXCallback(updates, UpdateCallback, null) }, 'json' )
		})
		.done(() => { $('#' + id).remove() })
	})
})

// ------------------------------------------------------------------------------------------------//
// ------------------------------------------- CALLBACKS ------------------------------------------//
// ------------------------------------------------------------------------------------------------//
function AJAXCallback(jsonResults, successCallback, errorCallback = null, callbackArg = null) {
	if (jsonResults.errno) { if (errorCallback) errorCallback(jsonResults.id); ThrowJSONError(jsonResults) }
	else if (successCallback) { successCallback(jsonResults, callbackArg) }
	UpdateOpStatus(false)
}

function RefreshCallback(jsonRecords, recordType = 'base') {
	$('#bulk-ops-icons .bulk-select-toggle').prop('checked', false).siblings('label').removeAttr('style');
	$('.db-table > tbody, .app-table > tbody').html(JSONRecordsToHTMLRows(jsonRecords, recordType)); trackedRecords = {}
}

function SubTableCallback(jsonRecords, action) {
	$('.sub-table > thead > tr > th').after(FieldsToHTMLHeaders(jsonRecords[0]))
	$('.sub-table > tbody').html(JSONRecordsToHTMLRows(jsonRecords, action))
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
	RemoveTrackedRecords(successList, OpRemoveCondition)
	UpdateCheckedRows()

	var disableParents = {}
	parentTargets.forEach(parentID => { disableParents[parentID] = (disableParents[parentID] || 0) + 1 })
	for (let [parentID, count] of Object.entries(disableParents)) {
		if (count === 1) $(GetRowSelector([parentID]) + ' > td > .show-children-toggle + label').toggleClass('disabled', true)
	}

	var idArray = []
	orphanTargets.forEach(rowElement => { idArray.push(GetCellID(rowElement)) })
	if (idArray.length) $.post('update?table=' + pageTable, JSON.stringify({ id:idArray, fields:{ParentID:""}}), updatedChildren => { AJAXCallback(updatedChildren, EditKitCallback) })

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
			else if (key === 'CheckedOut') {
				$('#' + record.ID + ' > td > .check-out').toggleClass('disabled', value)
				$('#' + record.ID + ' > td > .check-in').toggleClass('disabled', !value)
			}

			var fieldIndex = GetFieldIndex(key)
			if (fieldIndex < 0) continue
			var cell = $(GetRowSelector([record.ID])).children('td').eq(fieldIndex)
			$(cell).text(value)
			var row = GetRowSelector([record.ID])
			let fieldName = GetFieldName($(cell).index())
			if (IsIndirectField(fieldName)) {
				let foreignKey = fieldSchema[fieldName].foreignKey
				var queryString = 'fields=' + foreignKey.indirectField + '&ID=' + value
				UpdateOpStatus(true)
				$.getJSON('getRecords?table=' + foreignKey.table + '&' + queryString, jsonRecords => { AJAXCallback(jsonRecords, IndirectFieldCallback, null, cell) })
			}
			var undoAble = !IsReadOnlyField(fieldName) && (RemoveTrackedRecords([record.ID], LeaveCellRemoveCondition).length === 0)
			$(row + ' .undo').toggleClass('disabled', !undoAble)

		}
		if (record.ParentID) UpdateShowKit(record.ID)
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

function ResetChangeCallback(id) { UndoRowChange(id, trackedRecords[id]); RemoveTrackedRecords([id], LeaveCellRemoveCondition) }

function UndoRowChange(id, originalRecord) {
	var newRecord = HTMLRowsToJSONRecords($(GetRowSelector([id])))
	newRecord = newRecord[Object.keys(newRecord)[0]]
	for (let [oldField, oldValue] of Object.entries(originalRecord)) {
		if (oldValue !== newRecord[oldField]) {
			var fieldIndex = GetFieldIndex(oldField)
			if (fieldIndex < 0) continue
			let cell = $('#' + id + ' > td:eq(' + fieldIndex + ')')
			$(cell).text(oldValue)
			let fieldName = GetFieldName($(cell).index())
			if (IsIndirectField(fieldName)) {
				$(cell).attr('id', 'indirect' + fieldName + '-' + oldValue)
				let foreignKey = fieldSchema[fieldName].foreignKey
				var queryString = 'fields=' + foreignKey.indirectField + '&ID=' + oldValue
				UpdateOpStatus(true)
				$.getJSON('getRecords?table=' + foreignKey.table + '&' + queryString, jsonRecords => { AJAXCallback(jsonRecords, IndirectFieldCallback, null, cell) })
			}
		}
	}

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

function IndirectFieldCallback(updates, indirect) {
	var element = (indirect.cell) ? $('#' + indirect.row + ' >#' + indirect.cell) : indirect
	$(element).text(Object.values(updates[0])[0])
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
	var rowSelector = 'main > .responsive-table > table > tbody > '
	idArray.forEach(eachID => rowSelector += 'tr#' + eachID + ',' )
	return rowSelector.replace(/,$/, '')
}

function OpenSmartInput(options, cell) {
	$(cell).removeClass('td-padding').html(SmartInput(cell, options)).children('.smart-input').focus().select()
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

function BuildDependencyTree(pushArray, searchArray, idToFind, nestLimit = -1, nestValue = 0) {
	searchArray.forEach(idPair => {
		if (idPair[1] === idToFind) {
			pushArray.push(idPair[0]);
			nestValue++
			if (nestLimit === -1 || nestValue < nestLimit) {
				pushArray = BuildDependencyTree(pushArray, searchArray, idPair[0], nestLimit, nestValue)
			}
		}
	})
	return pushArray
}

function BuildFirstChildTree(childArray, searchArray, parentID) {
	searchArray.forEach(idPair => { if (idPair[1] === idToFind) { pushArray.push(idPair[0]) } })
	return pushArray
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

function UpdateCheckedRows(checkedTarget = '.db-table > tbody') {
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

function GetFieldName(index) { return $('main').find('table > thead > tr > th').eq(index).text() }
function GetFieldIndex(fieldName) { return $('main').find('table > thead > tr > th').filter((index, element) => { return $(element).text() === fieldName }).index() }

function IsIntField(fieldName) { return fieldSchema[fieldName].type === 'INTEGER' || fieldName.match(/q(uanti)?ty|c(ou)?nt/i) }
function IsNumberField(fieldName) { return fieldSchema[fieldName].type === 'NUMBER' || fieldName.match(/num(ber)?/i) }
function IsBoolField(fieldName) {
	return fieldName.match(/^Is|^Can|ed$|fl(a)?g/i)
		|| (fieldSchema[fieldName].range !== null
		&& fieldSchema[fieldName].range[0] === '-1'
		&& fieldSchema[fieldName].range[1] === '0'
		&& fieldSchema[fieldName].range[2] === '1')
}
function IsReadOnlyField(fieldName) { return fieldSchema[fieldName].readOnly }
function IsRangeField(fieldName) { return fieldSchema[fieldName].range !== null && fieldSchema[fieldName].range.length > 0 }
function IsDateField(fieldName) { return fieldName.match(/date/i) && !fieldName.match(/time/i) }
function IsDateTimeField(fieldName) { return fieldName.match(/datetime/i) }
function IsEmailField(fieldName) { return fieldName.match(/email/i) }
function IsPhoneField(fieldName) { return fieldName.match(/phone/i) }
function IsIndirectField(fieldName) { return Object.values(fieldSchema[fieldName].foreignKey).length && Object.values(fieldSchema[fieldName].foreignKey.indirectField).length }

function GetCellID(cell) { if (IsIntField('ID') || IsNumberField('ID')) return Number($(cell).closest('tr').attr('id')); return $(cell).closest('tr').attr('id') }
function GetCellValue(dataElement) {
	var fieldName = GetFieldName($(dataElement).closest('td').index())
	if (fieldSchema[fieldName]) {
		if (IsBoolField(fieldName)) { return 0 + $(dataElement).prop('checked') || Number($(dataElement).text()) }
		else if (IsIndirectField(fieldName)) {
			let value = ($(dataElement).hasClass('smart-input')) ? $(dataElement.options[dataElement.selectedIndex]).attr('id').replace(/option-/, '') :
				$(dataElement).attr('id').substr($(dataElement).attr('id').lastIndexOf('-') + 1) || $(dataElement).text()
			return (IsIntField(fieldName) || IsNumberField(fieldName)) ? Number(value) : value
		}
		else if (IsIntField(fieldName) || IsNumberField(fieldName)) { return Number((!dataElement.value) ? $(dataElement).text() : dataElement.value) }
		else if (IsRangeField(fieldName)) { return ($(dataElement).hasClass('smart-input')) ? fieldSchema[fieldName].range[dataElement.selectedIndex] : $(dataElement).text() }
		else if (IsDateTimeField(fieldName)) { return ($(dataElement).hasClass('smart-input')) ? $(dataElement).val().replace(/T/, ' ') : $(dataElement).text().replace(/ /, 'T') }
		else if (IsPhoneField(fieldName)) {
			let value = ($(dataElement).hasClass('smart-input')) ? $(dataElement).val() : $(dataElement).text()
			let matchValues = value.match(/([0-9]{3})([0-9]{3})([0-9]{4})/)
			let returnValue = (matchValues) ? '(' + matchValues[1] + ')' + matchValues[2] + '-' + matchValues[3] : value
			return returnValue
		}
	}
	return ($(dataElement).val() === '') ? $(dataElement).text() : $(dataElement).val()
}

function FieldsToHTMLHeaders(fields) { var html = ''; for (let eachField in fields) { html += '<th>' + eachField + '</th>' }; return html }

function FieldStringFromFieldSchema() {
	var fieldString = ''
	for ([field, value] of Object.entries(fieldSchema)) {
		if (Object.keys(value.foreignKey).length) {
			fieldString += '&fields=' + field + ',' + value.foreignKey.table + ',' + value.foreignKey.field
		} else { fieldString += '&fields=' + field }
	}
	return fieldString
}

function FieldStringFromTableHeaders() {
	var fields = {}
	$('main').find('table > thead > tr > th').each((index, header) => { if (fieldSchema[$(header).text()]) fields[$(header).text()] = fieldSchema[$(header).text()] })
	var fieldString = '&fields=ID'
	for ([field, value] of Object.entries(fields)) {
		if (Object.keys(value.foreignKey).length) {
			fieldString += '&fields=' + field + ',' + value.foreignKey.table + ',' + value.foreignKey.field
		} else { fieldString += '&fields=' + field }
	}
	return fieldString
}

function WhereStringFromWhereClass(contextClass) {
	var whereString = ''
	$('.where-clause > span.' + contextClass).each((index, element) => { whereString += '&' + $(element).attr('id') + '=' + $(element).text() })
	return whereString
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

function JSONRecordsToHTMLRows(jsonRecords, recordType = 'base') {
	var html = ''
	var id = null
	var parentArray = jsonRecords.filter(record => record.ParentID !== null).map(record => record.ParentID)
	jsonRecords.forEach(eachRecord => {
		id = eachRecord.ID
		if (id == 0) return
		if (recordType === 'base') {
			html += '<tr id="' + id + '"><td class="read-only">'
			var enableKit = ''
			if (eachRecord.ParentID !== '' | eachRecord.CanCheckOut) enableKit = 'disabled'
			var enableChildren = (parentArray.indexOf(id) > -1) ? '' : 'disabled'
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
		} else if (recordType === 'manage') {
			html += '<tr><td class="read-only"><input type="checkbox" id="bulk-select-sub-table-' + id + '" class="display-none toggle select-toggle">\
				<label for="bulk-select-sub-table-' + id + '" class="checkbox-icon line-icon"></label>\
				<img src="/icons/delete.svg" class="remove-kit line-icon" title="Remove this item from the kit"></td>'
		} else if (recordType === 'edit') {
			html += '<tr><td class="read-only"><input type="radio" id="select-kit-' + id + '" class="display-none radio" name="kit-select">\
				<label for="select-kit-' + id + '" class="radio-icon line-icon" title="Select to add this as the parent in the kit"></td>'
		} else if (recordType === 'app') {
			var checkedOut = (eachRecord.CheckedOut) ? 'disabled' : ''
			var checkedIn = (!eachRecord.CheckedOut) ? 'disabled' : ''
			html += '<tr id="' + id + '"><td class="read-only"><button type="button" class="app-button check-out ' + checkedOut + '">Check Out</button>\
				<button type="button" class="app-button check-in ' + checkedIn + '">Check In</button></td>'
		} else { html += '<tr><td></td>'}
		for (let [field, value] of Object.entries(eachRecord)) {
			if (field === 'ID' && recordType === 'app') continue
			let readOnly = (field.includes("ID")) ? 'read-only' : ''
			let indirect = {row:'', cell:''}
			let indirectCell = ''
			if (fieldSchema[field].foreignKey.indirectField) {
				indirectCell = 'id=indirect' + field + '-' + value
				indirect.row = id
				indirect.cell = indirectCell.replace(/id=/, '')
				let foreignKey = fieldSchema[field].foreignKey
				var queryString = 'fields=' + foreignKey.indirectField + '&ID=' + value
				UpdateOpStatus(true)
				$.getJSON('getRecords?table=' + foreignKey.table + '&' + queryString, jsonRecords => { AJAXCallback(jsonRecords, IndirectFieldCallback, null, indirect) })
			}
			html += '<td class="td-padding ' + readOnly + '" ' + indirectCell + '>' + value + '</td>'
		}
		html += '</tr>'
	})
	return html
}

function SmartInput(cell, options = null) {
	var fieldName = GetFieldName($(cell).index())
	var html = ''
	var type = 'text'
	var min = 0
	var max = ''
	var value = GetCellValue(cell)
	var placeholder = ''
	var pattern = ''
	var checked = (value) ? 'checked' : ''
	if (IsRangeField(fieldName) && !IsBoolField(fieldName)) {
		html = '<select class="smart-input">'
		fieldSchema[fieldName].range.forEach(eachValue => {
			html += '<option value="' + eachValue + '"'
			html += (value === eachValue) ? ' selected' : ''
			html += '>' + eachValue + '</option>'
		})
		html += '</select>'
	} else if (IsIndirectField(fieldName) && options) {
		html = '<select class="smart-input">'
		options.forEach(eachOption => {
			let keys = Object.keys(eachOption)
			html += '<option value="' + eachOption[keys[1]] + '" id=option-' + eachOption[keys[0]]
			html += (value === eachOption[keys[0]]) ? ' selected' : ''
			html += '>' + eachOption[keys[1]] + '</option>'
		})
		html += '</select>'
	} else {
		if (IsBoolField(fieldName)) { type = 'checkbox' }
		else if (IsIntField(fieldName)) { type = 'number' }
		else if (IsDateField(fieldName)) { type = 'date' }
		else if (IsDateTimeField(fieldName)) { type = 'datetime-local'; value = value.replace(/ /, 'T') }
		else if (IsEmailField(fieldName)) { type = 'email'; placeholder = 'someone@example.com' }
		else if (IsPhoneField(fieldName)) { type = 'tel'; placeholder = '(555)555-5555'; pattern = 'pattern="\\(*[0-9]{3}\\)*[0-9]{3}\-*[0-9]{4}"' }
		html = '<input type="' + type
				  + '" min="' + min
				  + '" max="' + max
				  + '" ' + checked
				  + ' value="' + value
				  + '" placeholder="' + placeholder
				  + '"' + pattern
				  + ' class="smart-input">'
	}

	return html
}
