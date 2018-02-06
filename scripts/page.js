// ------------------------------------------------------------------------------------------------//
// ------------------------------------------- GLOBALS --------------------------------------------//
// ------------------------------------------------------------------------------------------------//
var trackedRecords = []
var fieldSchema = {}
var queued = 0
var dragging = false

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
		$.getJSON('getFields', function ( fields ) {
			if (fields.errno) { ThrowJSONError(fields) }
			else { fieldSchema = fields; $('.db-table > thead > tr > th').after(FieldsToHTMLHeaders(fields)); Refresh() }
		})
	}
})

// ------------------------------------------------------------------------------------------------//
// --------------------------------------- EVENT TRACKING -----------------------------------------//
// ------------------------------------------------------------------------------------------------//
// ------------------------------------ Track dragging input --------------------------------------//
$('body').on('touchmove', '.db-table > tbody > tr > td', () => dragging = true)

// --------------------------------------- Edit table cell ----------------------------------------//
$('body').on('dblclick touchend', '.db-table > tbody > tr > td:not(.read-only)', (eventArgs) => { HandleCellEnter(eventArgs.currentTarget) })

// -------------------------------------- Leave table cell ----------------------------------------//
$('body').on('blur', '.db-table > tbody > tr > td', (eventArgs) => { HandleCellLeave(eventArgs.currentTarget) })

// ------------------------------------- Checked state of row changed -----------------------------//
$('body').on('change', '.db-table > tbody > tr .toggle', (checkedContext) => { UpdateCheckedRows(checkedContext) })

// --------------------------------- Checked state of bulk icon changed ---------------------------//
$('body').on('change', '.db-table > thead > tr .toggle', (eventArgs) => {
	if (eventArgs.currentTarget == eventArgs.target) {
		$('.db-table > tbody > tr .toggle').prop('checked', eventArgs.currentTarget.checked).change()
	}
})

// ------------------------------------- Refresh icon clicked -------------------------------------//
$('body').on('click', '.refresh', () => { Refresh() })

// ------------------------------------- Create icon clicked --------------------------------------//
$('body').on('click', '.create', () => { Create() })

// -------------------------------------- Delete icon clicked -------------------------------------//
$('body').on('click', '.delete, .delete-all', (eventArgs) => { Delete(eventArgs.currentTarget) })

// -------------------------------------- Undo icon clicked ---------------------------------------//
$('body').on('click', '.undo, .undo-all', (eventArgs) => { Undo(eventArgs.currentTarget) })

// ---------------------------- Add to new kit icon clicked ---------------------------------------//
$('body').on('click', '.add-new-kit, .add-new-kit-all', (eventArgs) => { AddToNewKit(eventArgs.currentTarget) })

// ---------------------------- Add to existing kit icon clicked ----------------------------------//
$('body').on('click', '.add-existing-kit, .add-existing-kit-all', (eventArgs) => { AddToExistingKit(eventArgs.currentTarget) })

// -------------------------------- Remove from kit icon clicked ----------------------------------//
$('body').on('click', '.remove-kit, .remove-kit-all', (eventArgs) => { RemoveFromKit(eventArgs.currentTarget) })

// ------------------------------- Sub-table toggle icon clicked ----------------------------------//
$('body').on('click', '.sub-table-toggle', (eventArgs) => { ToggleSubTable(eventArgs.currentTarget) })

// ------------------------------------------------------------------------------------------------//
// --------------------------------------- EVENT ACTIONS ------------------------------------------//
// ------------------------------------------------------------------------------------------------//
function Refresh() { UpdateOpStatus(true); $.getJSON('getRecords', jsonRecords => AJAXCallback(jsonRecords, RefreshCallback) ) }
function Create() { UpdateOpStatus(true); $.getJSON('create', jsonRecords => AJAXCallback(jsonRecords, CreateCallback) ) }

function Delete(context) {
	var idArray = GetIDsOfSelectedContext(context); if (idArray.length === 0) return
	if (confirm('Are you sure you want to delete these ' + idArray.length + ' record(s)?')) {
		UpdateOpStatus(true); $.post('delete', JSON.stringify(idArray), returnedList => AJAXCallback(returnedList, DeleteCallback, null, idArray), 'json')
	}
}

function Undo(context) {
	var undoQueue = GetOriginalRecordValues(GetIDsOfSelectedContext(context)); if (undoQueue.length === 0) { alert("There are no changes to roll back for a selected record!"); return }
	if (confirm('Are you sure you want to undo changes to these ' + undoQueue.length + ' record(s)?')) { UpdateOpStatus(true, undoQueue.length); UndoCallback(undoQueue) }
}

function AddToNewKit(context) {
	var idArray = GetIDsOfSelectedContext(context); if (idArray.length === 0) return;
	UpdateOpStatus(true)
	$.post('getParentRecords', JSON.stringify(idArray), parentRecords => {
		if (parentRecords.errno) { ThrowJSONError(parentRecords) }
		else if (parentRecords.length) {
			var nameList = '\n'
			parentRecords.forEach(record => { nameList += record.Name + '\n ' })
			alert("There is already a parent for these records: " + nameList.replace(/,$/, ''))
		} else {
			if (confirm('Are you sure you want to add these ' + idArray.length + ' records to a new kit?')) {
				UpdateOpStatus(true); $.post('addToNewKit', JSON.stringify(idArray), returnedRecord => AJAXCallback(returnedRecord, CreateCallback))
			}
		}
		UpdateOpStatus(false)
	}, 'json')
}

function AddToExistingKit(context) {
	var idArray = GetIDsOfSelectedContext(context); if (idArray.length === 0) return;
	if (confirm('Are you sure you want to add these ' + idArray.length + ' records to an existing kit?')) {
		alert('Send post to add ' + idArray.toString() + ' to an existing kit!\n\nNot implemented yet!')
	}
}

function RemoveFromKit(context) {
	var idArray = GetIDsOfSelectedContext(context); if (idArray.length === 0) return;
	if (confirm('Are you sure you want to remove these ' + idArray.length + ' records from this kit?')) {
		alert('Send post to remove ' + idArray.toString() + ' from their parent kit.\n\nNot implemented yet!')
	}
}

function ToggleSubTable(context) {
	var idArray = GetIDsOfSelectedContext(context); if (idArray.length === 0) return;
	alert('Toggling showing the sub-table for item(s) ' + idArray.toString())
}

// ------------------------------------------------------------------------------------------------//
// --------------------------------------- TABLE ACTIONS ------------------------------------------//
// ------------------------------------------------------------------------------------------------//
// -------------------------------------- Cell is entered -----------------------------------------//
function HandleCellEnter(cell) {
	if (!dragging && Editable(cell)) {
		var id = GetCellID(cell)
		if (trackedRecords.filter(record => record.ID === id).length === 0) trackedRecords = trackedRecords.concat(HTMLRowsToJSONRecords($(GetRowSelector([id]))))
		$(cell).removeClass('td-padding').html(SmartInput(cell)).children('.smart-input').focus().select()
	}
	dragging = false
}

// ------------------------------------- Cell is exited ---------------------------------------//
function HandleCellLeave(cell) {
	var smartInput = $(cell).children('.smart-input')
	if (!smartInput[0].checkValidity()) { smartInput.css('outline', 'solid red 1px').focus().select(); return }

	var value = GetCellValue($(cell).index(), smartInput[0])
	$(cell).text(value).addClass('td-padding').children('.smart-input').remove()
	
	var id = GetCellID(cell)
	if (RemoveTrackedRecords([id], LeaveCellRemoveCondition).length >= 1) {
		if (!$(GetRowSelector([id]) + ' .undo').hasClass('display-none-important')) { $(GetRowSelector([id]) + ' .undo').addClass('display-none-important') }
		return
	}
	UpdateOpStatus(true)
	$.post('update', JSON.stringify({'id':id, fields:{ [GetFieldName($(cell).index())]: value }}), (updates) => { AJAXCallback(updates, UpdateCallback, ResetCellCallback, cell) }, 'json')
}

// ------------------------------------------------------------------------------------------------//
// ------------------------------------------- CALLBACKS ------------------------------------------//
// ------------------------------------------------------------------------------------------------//
function AJAXCallback(jsonResults, successCallback, errorCallback = null, callbackArg = null) {
	if (jsonResults.errno) { if (errorCallback) errorCallback(jsonResults); ThrowJSONError(jsonResults) }
	else if (successCallback) successCallback(jsonResults, callbackArg)
	UpdateOpStatus(false)
}

function RefreshCallback(jsonRecords) {	$('.db-table > tbody').html(JSONRecordsToHTMLRows(jsonRecords)); trackedRecords = [] }

function DeleteCallback(errorList, originalList) {
	var successList = []
	originalList.filter(originalID => {
		var match = errorList.filter(errorID => originalID === errorID)
		if (!match.length) successList.push(originalID)
	})
	$(GetRowSelector(successList)).remove()
	UpdateCheckedRows()
	RemoveTrackedRecords(successList, OpRemoveCondition)
}

function CreateCallback(jsonRecords) {
	if ($('.db-table > tbody > tr').length === 0) { $('.db-table > tbody').html(JSONRecordsToHTMLRows(jsonRecords)) }
	else { $('.db-table > tbody > tr:last-child').after(JSONRecordsToHTMLRows(jsonRecords))}
}

function UpdateCallback(updates, cell) {
	$(cell).text(Object.values(updates[0])[1]);
	$(GetRowSelector([GetCellID(cell)]) + ' .undo').removeClass('display-none-important')
}

function ResetCellCallback(cell) { $(cell).text(trackedRecords.filter(record => record.ID === id)[GetFieldName($(cell).index())]) }

function UndoCallback(undoQueue) {
	if (undoQueue.length === 0) return;
	$.post('update', JSON.stringify(undoQueue[undoQueue.length - 1]), (returnedRecords) => {
		if (returnedRecords.errno) { ThrowJSONError(returnedRecords) }
		else { RemoveTrackedRecords([returnedRecords[0].ID], OpRemoveCondition, UndoRowChange) }
		undoQueue.pop()
		UpdateOpStatus(false)
		UndoCallback(undoQueue)
	}, 'json')
}

function UndoRowChange(id, originalRecord) {
	var newRecord = HTMLRowsToJSONRecords($(GetRowSelector([id])))[0]
	for (let [oldField, oldValue] of Object.entries(originalRecord)) {
		if (oldValue !== newRecord[oldField]) $('#' + id + ' > td:eq(' + GetFieldIndex(oldField) + ')').text(oldValue)
	}
	$(GetRowSelector([id]) + ' .toggle').prop('checked', false).change()
	if (!$(GetRowSelector([id]) + ' .undo').hasClass('display-none-important')) { $(GetRowSelector([id]) + ' .undo').addClass('display-none-important') }
}

// ------------------------------------------------------------------------------------------------//
// ------------------------------------------- CALLBACKS ------------------------------------------//
// ------------------------------------------------------------------------------------------------//
function LeaveCellRemoveCondition(id, originalRecord) {
	var newRecord = HTMLRowsToJSONRecords($(GetRowSelector([id])))[0]
	for (let eachProperty in originalRecord) { if (originalRecord[eachProperty] !== newRecord[eachProperty]) return false }
	return true
}

function OpRemoveCondition(id, originalRecord) { return id === originalRecord.ID }

// ------------------------------------------------------------------------------------------------//
// ------------------------------------------- RECORDS --------------------------------------------//
// ------------------------------------------------------------------------------------------------//
function GetRowSelector(idArray) {
	var rowSelector = '.db-table > tbody > '
	for (let eachID = 0; eachID < idArray.length; eachID++) { rowSelector += 'tr#' + idArray[eachID] + ',' }
	return rowSelector.replace(/,$/, '')
}

function FindRecordInTrackedRecords(id) { return trackedRecords.filter(record => record.ID === id)[0] }

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
	if ((queued > 0) && $('#queue-count').hasClass('display-none')) { $('#queue-count').removeClass('display-none') }
	else if (!queued && !($('#queue-count').hasClass('display-none'))) { $('#queue-count').addClass('display-none') }
}

function RemoveTrackedRecords(removeList, TestCondition, Callback = null) {
	var removedList = []
	for (let outerIndex = 0; outerIndex < removeList.length; outerIndex++) {
		for (let innerIndex = trackedRecords.length - 1; innerIndex >= 0; innerIndex--) {
			if (TestCondition(removeList[outerIndex], trackedRecords[innerIndex])) {
				if (Callback) Callback(removeList[outerIndex], trackedRecords[innerIndex])
				trackedRecords.splice(innerIndex, 1)
				removedList.push(removeList[outerIndex])
			}
		}
	}
	return removedList
}

function GetOriginalRecordValues(idArray) {
	var changedRecords = []
	for (let eachID = 0; eachID < idArray.length; eachID++) {
		let compareRecord = trackedRecords.filter(record => record.ID == idArray[eachID])[0]
		if (!compareRecord) continue
		var record = HTMLRowsToJSONRecords($(GetRowSelector([idArray[eachID]])))[0]
		var fieldChanges = {}
		for (let eachProperty in record) {
			if (record[eachProperty] !== compareRecord[eachProperty]) { fieldChanges[eachProperty] = compareRecord[eachProperty] }
		}
		changedRecords.push({'id':idArray[eachID], 'fields':fieldChanges})
	}
	return changedRecords
}

function UpdateCheckedRows(checkedContext) {
	if (checkedContext && checkedContext.target.checked) {
		$(checkedContext.target).closest('tbody > tr').addClass('checked')
	} else if (checkedContext && !checkedContext.target.checked) {
		$(checkedContext.target).closest('tbody > tr').removeClass('checked')
	}
	if (($('.db-table > tbody > tr').length > 0) && ( $('.db-table > tbody > tr.checked').length === $('.db-table > tbody > tr').length)) {
		$('.db-table > thead > tr .checkbox-icon').removeAttr('style')
		$('.db-table > thead > tr .toggle').prop('checked', true)

	} else if ($('.db-table > tbody > tr.checked').length > 0) {
		$('.db-table > thead > tr .toggle').prop('checked', false)
		$('.db-table > thead > tr .checkbox-icon').css('background-image', 'url(/icons/indeterminate.svg')
	}
	else {
		$('.db-table > thead > tr .checkbox-icon').removeAttr('style')
		$('.db-table > thead > tr .toggle').prop('checked', false)
	}
}

// ------------------------------------------------------------------------------------------------//
// ------------------------------------------- HELPERS --------------------------------------------//
// ------------------------------------------------------------------------------------------------//
function Editable(element) { return !IsReadOnlyField(GetFieldName($(element).index())) }

function ThrowJSONError(json) { alert(JSON.stringify(json)) }

function GetFieldSelectorByIndex(index) { return $('.db-table > thead > tr > th:eq(' + index + ')') }
function GetFieldSelectorByFieldName(fieldName) { return $('.db-table > thead > tr > th:eq(' + FindHTMLHeader(fieldName) + ')') }
function GetFieldName(index) { return GetFieldSelectorByIndex(index).text() }
function GetFieldIndex(fieldName) { return $('.db-table > thead > tr > th').filter((index, element) => { return $(element).text() === fieldName }).index() }

function IsIntField(fieldName) { return fieldSchema[fieldName].type === 'INTEGER' || fieldName.match(/q(uanti)?ty|c(ou)?nt/i) }
function IsNumberField(fieldName) { return fieldSchema[fieldName].type === 'NUMBER' || fieldName.match(/num(ber)?/i) }
function IsBoolField(fieldName) { return fieldSchema[fieldName].range === '-1,0,1' || fieldName.match(/^Is|^Can|ed$|fl(a)?g/i) }
function IsReadOnlyField(fieldName) { return fieldSchema[fieldName].readOnly }

function GetCellID(cell) { if (IsIntField('ID') || IsNumberField('ID')) return Number($(cell).closest('tr').attr('id')); return $(cell).closest('tr').attr('id') }
function GetCellValue(dataIndex, dataElement) {
	var fieldName = GetFieldName(dataIndex)
	if (IsBoolField(fieldName)) { return 0 + $(dataElement).prop('checked') || Number($(dataElement).text()) }
	else if (IsIntField(fieldName) || IsNumberField(fieldName)) { return ($(dataElement).text() === 'null') ? null : Number($(dataElement).text()) }
	// Check that string isn't set to null - set return value as literal null and not just 'null'
	// TODO
	else { return ($(dataElement).val() === '') ? $(dataElement).text() : $(dataElement).val() }
}

function FieldsToHTMLHeaders(fields) { var html = ''; for (let eachField in fields) { html += '<th>' + eachField + '</th.type>' }; return html }

function HTMLRowsToJSONRecords(jqueryRows) {
	var jsonRecords = []
	var numberOfFields = Object.keys(fieldSchema).length

	$(jqueryRows).each((rowIndex, row) => {
		let record = {}
		record.ID = GetCellID(row)
		$(row).children('td').each(((dataIndex, dataElement) => { if (GetFieldName(dataIndex).trim().length) record[GetFieldName(dataIndex)] = GetCellValue(dataIndex, dataElement) }))
		jsonRecords.push(record)
	})
	return jsonRecords
}

function JSONRecordsToHTMLRows(jsonRecords) {
	var html = ''
	var id = null
	for (let eachRecord = 0; eachRecord < jsonRecords.length; eachRecord++) {
		id = jsonRecords[eachRecord].ID
		html += '<tr id="' + id + '"><td class="read-only">\
		<input type="checkbox" id="bulk-apply-' + id + '" class="display-none toggle">\
		<label for="bulk-apply-' + id + '" class="checkbox-icon line-icon"></label>\
		<img src="/icons/delete.svg" class="delete line-icon" title="Delete this record from the database">'
		if (jsonRecords[eachRecord].ParentID === null && !jsonRecords[eachRecord].CanCheckOut) {
			html += '<img src="/icons/add-new-kit.svg" class="add-new-kit line-icon" title="Add this item to a new kit">\
				<img src="/icons/add-existing-kit.svg" class="add-existing-kit line-icon" title="Add this item to an existing kit">'
		} else {
			html += '<input type="checkbox" id="sub-table-' + id + '" class="display-none toggle sub-table-toggle">\
				<label for="sub-table-' + id + '" class="checkbox-icon line-icon"></label>'
		}
		html += '<img src="/icons/undo.svg" class="undo display-none-important line-icon" title="Undo all changes to this record"></td>'
		for (let [field, value] of Object.entries(jsonRecords[eachRecord])) { html += '<td class="td-padding">' + value + '</td>' }
		html += '</tr>'
	}
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
		if (GetCellValue($(cell).index(), cell)) checked = 'checked'
	} else if (IsIntField(fieldName)) {
		type = 'number'
		min = 0
	}

	return '<input type="' + type + '" min="' + min + '" max="' + max + '" ' + checked + ' value="' + $(cell).text() + '" class="smart-input">'
}
