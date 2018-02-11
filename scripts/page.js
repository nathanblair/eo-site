// ------------------------------------------------------------------------------------------------//
// ------------------------------------------- GLOBALS --------------------------------------------//
// ------------------------------------------------------------------------------------------------//
var trackedRecords = {}
var fieldSchema = {}
var queued = 0
var dragging = false

// TODO
// Use change of text field event to show and hide the rollback icons
// Needs fixing!
// Use change of parentID field event to show and hide the add-to-kit icons
// Use better event driven programming all around!

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
			else {
				fieldSchema = fields;
				$('.db-table > thead > tr > th').after(FieldsToHTMLHeaders(fields));
				UpdateOpStatus(true); $.getJSON('getRecords', jsonRecords => AJAXCallback(jsonRecords, RefreshCallback))
			}
		})
	}
})

// ------------------------------------------------------------------------------------------------//
// --------------------------------------- EVENT TRACKING -----------------------------------------//
// ------------------------------------------------------------------------------------------------//
// ------------------------------------ Track dragging input --------------------------------------//
$('body').on('touchmove', '.db-table > tbody > tr > td', () => dragging = true)

// --------------------------------------- Edit table cell ----------------------------------------//
$('body').on('dblclick touchend', '.db-table > tbody > tr > td:not(.read-only)', eventArgs => {
	var cell = eventArgs.currentTarget;
	if (!dragging && Editable(cell)) {
		var id = GetCellID(cell)
		if (!trackedRecords[id]) {
			for ([recordID, record] of Object.entries(HTMLRowsToJSONRecords($(GetRowSelector([id]))))) { trackedRecords[recordID] = record }
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
	$.post(	'update', JSON.stringify({'id':[id], fields:{ [GetFieldName($(cell).index())]: value }}), updates => { AJAXCallback(updates, UpdateCallback, ResetCellCallback, cell) }, 'json'
	)
})

// ------------------------------------ Table cell changed ----------------------------------------//
$('body').on('change', '.db-table > tbody > tr > td:not(.read-only)', eventArgs => {
	var cell = eventArgs.currentTarget
	var row = GetRowSelector([GetCellID(cell)])
	if ($(cell).closest('tr').children('td').eq(GetFieldIndex('ParentID')).text() !== 'null') $(row + ' > .add-to-kit').hide()
	if (!IsReadOnlyField(GetFieldName($(cell).index()))) {
		state = GetCellValue(cell) !== trackedRecords[GetCellID(cell)][GetFieldName($(cell).index())] ? 'inline-block' : 'none'
		$(row + ' .undo').css('display', state)
	}
})

// ------------------------------------- Checked state of row changed -----------------------------//
$('body').on('change', '.db-table > tbody > tr .toggle', checkedContext => { UpdateCheckedRows(checkedContext) })

// --------------------------------- Checked state of bulk icon changed ---------------------------//
$('body').on('change', '.db-table > thead > tr .toggle', eventArgs => {
	if (eventArgs.currentTarget == eventArgs.target) {
		$('.db-table > tbody > tr .toggle').prop('checked', eventArgs.currentTarget.checked).change()
	}
})

// ------------------------------------- Refresh icon clicked -------------------------------------//
$('body').on('click', '.refresh', () => { UpdateOpStatus(true); $.getJSON('getRecords', jsonRecords => AJAXCallback(jsonRecords, RefreshCallback)) })

// ------------------------------------- Create icon clicked --------------------------------------//
$('body').on('click', '.create', () => { UpdateOpStatus(true); $.getJSON('create', jsonRecords => AJAXCallback(jsonRecords, CreateCallback) ) })

// -------------------------------------- Delete icon clicked -------------------------------------//
$('body').on('click', '.delete, .delete-all', eventArgs => { 
	var idArray = GetIDsOfSelectedContext(eventArgs.currentTarget); if (idArray.length === 0) return
	if (confirm('Are you sure you want to delete these ' + idArray.length + ' record(s)?')) {
		UpdateOpStatus(true); $.post('delete', JSON.stringify(idArray), returnedList => AJAXCallback(returnedList, DeleteCallback, null, idArray), 'json')
	}
})

// -------------------------------------- Undo icon clicked ---------------------------------------//
$('body').on('click', '.undo, .undo-all', eventArgs => {
	let undoQueue = GetOriginalRecordValues(GetIDsOfSelectedContext(eventArgs.currentTarget))
	if (undoQueue.length === 0) { alert("There are no changes to roll back for a selected record!"); return }
	if (confirm('Are you sure you want to undo changes to these ' + undoQueue.length + ' record(s)?')) { UpdateOpStatus(true, undoQueue.length); UndoCallback(undoQueue) }
})

// ---------------------------- Add to new kit icon clicked ---------------------------------------//
$('body').on('click', '.add-new-kit, .add-new-kit-all', eventArgs => { AddToNewKit(eventArgs.currentTarget) })

// ---------------------------- Add to existing kit icon clicked ----------------------------------//
$('body').on('click', '.add-existing-kit, .add-existing-kit-all', eventArgs => { AddToExistingKit(eventArgs.currentTarget) })

// -------------------------------- Remove from kit icon clicked ----------------------------------//
$('body').on('click', '.remove-kit, .remove-kit-all', eventArgs => { RemoveFromKit(eventArgs.currentTarget) })

// ------------------------------- Sub-table toggle icon clicked ----------------------------------//
$('body').on('click', '.sub-table-toggle', eventArgs => { ToggleSubTable(eventArgs.currentTarget) })

// ------------------------------------------------------------------------------------------------//
// --------------------------------------- EVENT ACTIONS ------------------------------------------//
// ------------------------------------------------------------------------------------------------//
function AddToNewKit(context) {
	var idArray = GetIDsOfSelectedContext(context); if (idArray.length === 0) return
	if (confirm('Are you sure you want to add these ' + idArray.length + ' records to a new kit?')) {
		UpdateOpStatus(true)
		$.post('create', JSON.stringify(idArray), returnedRecord => {
			AJAXCallback(returnedRecord, CreateCallback)
			$.post('update', JSON.stringify({ id:idArray, fields:{ParentID:returnedRecord[0].ID}}), updatedChildren => { AJAXCallback(updatedChildren, UpdateCallback) })
		})
	}
	UpdateOpStatus(false)
}

function AddToExistingKit(context) {
	var idArray = GetIDsOfSelectedContext(context); if (idArray.length === 0) return
	if (confirm('Are you sure you want to add these ' + idArray.length + ' records to an existing kit?')) {
		alert('Send post to add ' + idArray.toString() + ' to an existing kit!\n\nNot implemented yet!')
	}
}

function RemoveFromKit(context) {
	var idArray = GetIDsOfSelectedContext(context); if (idArray.length === 0) return
	if (confirm('Are you sure you want to remove these ' + idArray.length + ' records from this kit?')) {
		alert('Send post to remove ' + idArray.toString() + ' from their parent kit.\n\nNot implemented yet!')
	}
}

function ToggleSubTable(context) {
	var idArray = GetIDsOfSelectedContext(context); if (idArray.length === 0) return
	alert('Toggling showing the sub-table for item(s) ' + idArray.toString())
}

// ------------------------------------------------------------------------------------------------//
// ------------------------------------------- CALLBACKS ------------------------------------------//
// ------------------------------------------------------------------------------------------------//
function AJAXCallback(jsonResults, successCallback, errorCallback = null, callbackArg = null) {
	if (jsonResults.errno) { if (errorCallback) errorCallback(jsonResults); ThrowJSONError(jsonResults) }
	else if (successCallback) successCallback(jsonResults, callbackArg)
	UpdateOpStatus(false)
}

function RefreshCallback(jsonRecords) {	$('.db-table > tbody').html(JSONRecordsToHTMLRows(jsonRecords)); UpdateCheckedRows(); trackedRecords = {} }

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
		for ([key, value] of Object.entries(record)) {
			if (key === 'ID') continue
			$(row).children('td').eq(GetFieldIndex(key)).text(value).change()
		}
	})
}

function ResetCellCallback(cell) { $(cell).text(trackedRecords[GetCellID(cell)][GetFieldName($(cell).index())]).change() }

function UndoCallback(undoQueue) {
	if (undoQueue.length === 0) return;
	$.post('update', JSON.stringify(undoQueue[undoQueue.length - 1]), returnedRecords => {
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
		for ([trackedRecordID, trackedRecord] of Object.entries(trackedRecords)) {
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
function GetCellValue(dataElement) {
	var fieldName = GetFieldName($(dataElement).closest('td').index())
	if (IsBoolField(fieldName)) { return 0 + $(dataElement).prop('checked') || Number($(dataElement).text()) }
	else if (IsIntField(fieldName) || IsNumberField(fieldName)) { return ($(dataElement).text() === 'null') ? null : Number($(dataElement).text()) }
	// Check that string isn't set to null - set return value as literal null and not just 'null'
	// TODO
	else { return ($(dataElement).val() === '') ? $(dataElement).text() : $(dataElement).val() }
}

function FieldsToHTMLHeaders(fields) { var html = ''; for (let eachField in fields) { html += '<th>' + eachField + '</th.type>' }; return html }

function HTMLRowsToJSONRecords(jqueryRows) {
	var jsonRecords = {}

	$(jqueryRows).each((rowIndex, row) => {
		let record = {}
		$(row).children('td').each(((dataIndex, dataElement) => { if (GetFieldName(dataIndex).trim().length) record[GetFieldName(dataIndex)] = GetCellValue(dataElement) }))
		jsonRecords[record.ID] = record
	})
	return jsonRecords
}

function JSONRecordsToHTMLRows(jsonRecords) {
	var html = ''
	var id = null
	jsonRecords.forEach(eachRecord => {
		id = eachRecord.ID
		html += '<tr id="' + id + '"><td class="read-only">\
		<input type="checkbox" id="bulk-apply-' + id + '" class="display-none toggle">\
		<label for="bulk-apply-' + id + '" class="checkbox-icon line-icon"></label>\
		<img src="/icons/delete.svg" class="delete line-icon" title="Delete this record from the database">'
		if (eachRecord.ParentID === null && !eachRecord.CanCheckOut) {
			html += '<img src="/icons/add-new-kit.svg" class="add-new-kit add-to-kit line-icon" title="Add this item to a new kit">\
				<img src="/icons/add-existing-kit.svg" class="add-existing-kit add-to-kit line-icon" title="Add this item to an existing kit">'
		}
		html += '<img src="/icons/undo.svg" class="undo line-icon display-none" title="Undo all changes to this record"></td>'
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
