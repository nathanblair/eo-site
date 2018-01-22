// ------------------------------------------------------------------------------------------------//
// ------------------------------------------- GLOBALS --------------------------------------------//
// ------------------------------------------------------------------------------------------------//
var trackedRecords = []
var queued = 0
var dragging = false

// Continue testing update/rollback operations
// Implement keyboard shortcuts

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
$.get('main', function( data ) {
	$('main').html(data)
	if ($('main .db-table').length > 0) {
		$.getJSON('getRecords', function ( jsonRecords ) {
			if (jsonRecords.errno) { ThrowJSONError(jsonRecords) }
			else { $('.db-table').html(WriteTable(jsonRecords)) }
		})
	}
})

// ------------------------------------------------------------------------------------------------//
// --------------------------------------- EVENT TRACKING -----------------------------------------//
// ------------------------------------------------------------------------------------------------//
// ------------------------------------ Track dragging input --------------------------------------//
$('body').on('touchmove', '.db-table > tbody > tr > td', () => dragging = true)

// --------------------------------------- Edit table cell ----------------------------------------//
$('body').on('dblclick touchend', '.db-table > tbody > tr > td', (eventArgs) => { HandleCellEnter(eventArgs.currentTarget) })

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

// ------------------------------------- Delete icon clicked -------------------------------------//
$('body').on('click', '.delete, .delete-all', (eventArgs) => { Delete(eventArgs) })

// ------------------------------------- Undo icon clicked ---------------------------------------//
$('body').on('click', '.undo, .undo-all', (eventArgs) => { Undo(eventArgs) })

// ------------------------------------------------------------------------------------------------//
// ------------------------------------------ OP ACTIONS ------------------------------------------//
// ------------------------------------------------------------------------------------------------//
function Refresh() {
	UpdateOpStatus(true)
	$('.db-table tbody tr').remove()
	$.getJSON('getRecords', function(jsonRecords) {
		if (jsonRecords["errno"]) { ThrowJSONError(jsonRecords) }
		else { $('.db-table > tbody').html(JSONRecordsToHTMLRows(jsonRecords))}
		trackedRecords = []
		UpdateOpStatus(false)
	})
}

function Create() {
	UpdateOpStatus(true)
	$.getJSON('create', function( jsonRecords ) {
		if (jsonRecords["errno"]) { ThrowJSONError(jsonRecords) }
		else { $('.db-table > tbody > tr:last-child').after(JSONRecordsToHTMLRows(jsonRecords))}
		UpdateOpStatus(false)
	})
}

function Delete(eventArgs) {
	var idArray = GetIDsOfSelectedContext(eventArgs.target)
	if (idArray.length === 0) return
	
	if (confirm('Are you sure you want to delete these ' + idArray.length + ' record(s)?')) {
		UpdateOpStatus(true)
		$.post('delete', JSON.stringify(idArray), function(returnedList) {
			if (returnedList["errno"]) { ThrowJSONError(returnedList) }
			else {
				var successList = ProcessIDList(returnedList, idArray)
				DeleteRecordsFromTable(successList)
				UpdateCheckedRows()
				RemoveTrackedRecords(successList, OpRemoveCondition)
			}
			UpdateOpStatus(false)
		}, 'json')
	}
}

function Undo(eventArgs) {
	var idArray = GetIDsOfSelectedContext(eventArgs.target)
	var undoQueue = GetOriginalRecordValues(idArray)
	if (undoQueue.length === 0) { alert("There are no changes to roll back for a selected record!"); return }
	else if (undoQueue.length !== idArray.length) { alert("There were " + (idArray.length - undoQueue.length) + " record(s) selected that will not be undone\nThese record(s) do not have rollback entries") }
	if (confirm('Are you sure you want to undo changes to these ' + undoQueue.length + ' record(s)?')) {
		UpdateOpStatus(true, undoQueue.length)
		PostUndoUpdate(undoQueue)
	}
}

// ------------------------------------- Cell is entered ---------------------------------------//
function HandleCellEnter(cell) {
	if (dragging || !Editable(cell)) { dragging = false; return }
	var id = $(cell).closest('tr').attr('id')

	if (FindRecordInTrackedRecords(id) === null) trackedRecords = trackedRecords.concat(HTMLRowsToJSONRecords($(GetRowSelector([id]))))
	$(cell).removeClass('td-padding').html(SmartInput(cell)).children('.smart-input').focus().select()
	dragging = false
}

// ------------------------------------- Cell is exited ---------------------------------------//
function HandleCellLeave(cell) {
	var smartInput = $(cell).children('.smart-input')
	if (!smartInput[0].checkValidity()) {
		smartInput.css('outline', 'solid red 1px').focus().select()
		return
	}

	var value = null
	if (smartInput.attr('type') === 'checkbox') { value += smartInput.prop('checked') }
	else { value = smartInput.val(); if ((!isNaN(value)) && value !== '') value = Number(value) }
	$(cell).text(value).addClass('td-padding').children('.smart-input').remove()
	
	var id = $(cell).closest('tr').attr('id')
	if (RemoveTrackedRecords([id], LeaveCellRemoveCondition).length >= 1) {
		if (!$(GetRowSelector([id]) + ' .undo').hasClass('display-none-important')) {
			$(GetRowSelector([id]) + ' .undo').addClass('display-none-important')
		}
		return
	}
	var passedJSON = {'id':id, fields:{ [$('.db-table > thead th:eq(' + $(cell).index() + ')').text()]: value }}
	UpdateOpStatus(true)
	$.post('update', JSON.stringify(passedJSON), (updates) => {
		if (updates["errno"] || updates.length > 1) {
			$(cell).text(trackedRecords[FindRecordInTrackedRecords([id])][$('.db-table > thead > tr > th:eq(' + $(cell).index() + ')').text()])
			ThrowJSONError(updates)
		} else {
			$(cell).text(Object.values(updates[0])[1])
			$(GetRowSelector([id]) + ' .undo').removeClass('display-none-important')
		}
		UpdateOpStatus(false)
	}, 'json')
}

// ------------------------------------------------------------------------------------------------//
// ------------------------------------------- CALLBACKS ------------------------------------------//
// ------------------------------------------------------------------------------------------------//
function LeaveCellRemoveCondition(id, originalRecord) {
	var newRecord = HTMLRowsToJSONRecords($(GetRowSelector([id])))[0]
	for (var eachProperty in originalRecord) { if (originalRecord[eachProperty] !== newRecord[eachProperty]) return false }
	return true
}

function OpRemoveCondition(id, originalRecord) { return id === parseInt(originalRecord.ID) }

function PostUndoUpdate(undoQueue) {
	if (undoQueue.length === 0) return;
	$.post('update', JSON.stringify(undoQueue[undoQueue.length - 1]), (returnedRecords) => {
		if (returnedRecords["errno"]) { ThrowJSONError(returnedRecords) }
		else { RemoveTrackedRecords([returnedRecords[0].ID], OpRemoveCondition, UndoRowChange) }
		undoQueue.pop()
		UpdateOpStatus(false)
		PostUndoUpdate(undoQueue)
	}, 'json')
}

function UndoRowChange(id, originalRecord) {
	var newRecord = HTMLRowsToJSONRecords($(GetRowSelector([id])))[0]
	var fieldIndex = 0
	for (let [oldField, oldValue] of Object.entries(originalRecord)) {
		if (oldValue !== newRecord[oldField]) $('#' + id + ' > td:eq(' + fieldIndex + ')').text(oldValue)
		fieldIndex++
	}
	$(GetRowSelector([id]) + ' .toggle').prop('checked', false).change()
	if (!$(GetRowSelector([id]) + ' .undo').hasClass('display-none-important')) {
		$(GetRowSelector([id]) + ' .undo').addClass('display-none-important')
	}
}

function DeleteRecordsFromTable(idArray) { $(GetRowSelector(idArray)).remove() }

// ------------------------------------------------------------------------------------------------//
// ------------------------------------------- HELPERS --------------------------------------------//
// ------------------------------------------------------------------------------------------------//
function Editable(element) { if ($(element).hasClass('read-only')) { return false } else { return true } }

function GetRowSelector(idArray) {
	var rowSelector = '.db-table > tbody > '
	for (var eachID = 0; eachID < idArray.length; eachID++) { rowSelector += 'tr#' + idArray[eachID] + ',' }
	return rowSelector.replace(/,$/, '')
}

function ThrowJSONError(json) { alert(JSON.stringify(json)) }

function FindRecordInTrackedRecords(id) {
	var index = null
	for (var eachRecord = 0; eachRecord < trackedRecords.length; eachRecord++) {
		if (trackedRecords[eachRecord].ID === id) { index = eachRecord; break }
	}
	return index
}

function GetIDsOfSelectedContext(context) {
	var idArray = []
	if ($(context).closest('tr').parent()[0].tagName === 'TBODY') { idArray.push($(context).closest('tr').attr('id')) }
	else if ($(context).closest('tr').parent()[0].tagName === 'THEAD') {
		$('.db-table tbody tr.checked').each(function(index, element) { idArray.push($(this).attr('id')) })
	}
	return idArray
}

function UpdateOpStatus(status, increment = null) {
	if (status && increment) {queued += increment } else if (status) { queued++ } else { queued-- }
	$('#queue-count > span').text(queued)
	if ((queued > 0) && $('#queue-count').hasClass('display-none')) { $('#queue-count').removeClass('display-none') }
	else if (!queued && !($('#queue-count').hasClass('display-none'))) { $('#queue-count').addClass('display-none') }
}

function ProcessIDList(errorList, idArray) {
	var successList = []
	for (var eachID = 0; eachID < idArray.length; eachID++) {
		var match = false
		for (var eachError = 0; eachError < errorList.length; eachError++) {
			if (idArray[eachID] === errorList[eachError]) { match = true; break }
		}
		if (!match) successList.push(idArray[eachID])
	}
	return successList
}

function RemoveTrackedRecords(removeList, TestCondition, Callback = null) {
	var removedList = []
	for (var outerIndex = 0; outerIndex < removeList.length; outerIndex++) {
		for (var innerIndex = trackedRecords.length - 1; innerIndex >= 0; innerIndex--) {
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
	for (var eachID = 0; eachID < idArray.length; eachID++) {
		let trackedIndex = FindRecordInTrackedRecords(idArray[eachID])
		if (trackedIndex === null) continue
		var fieldChanges = {}
		var record = HTMLRowsToJSONRecords($(GetRowSelector([idArray[eachID]])))[0]
		var compareRecord = trackedRecords[trackedIndex]
		for (var eachProperty in record) {
			if (record[eachProperty] !== compareRecord[eachProperty]) {
				fieldChanges[eachProperty] = parseInt(compareRecord[eachProperty]) || compareRecord[eachProperty]
			}
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
	if ($('.db-table > tbody > tr.checked').length === $('.db-table > tbody > tr').length) {
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

function HTMLRowsToJSONRecords(htmlRows) {
	var jsonRecords = []
	var numberOfFields = $('.db-table > thead > tr > th').length

	for (var eachRecord = 0; eachRecord < htmlRows.length; eachRecord++) {
		jsonRecords[eachRecord] = {}
		jsonRecords[eachRecord].ID = $(htmlRows[eachRecord]).attr('id')
		for (var eachData = 1; eachData < numberOfFields; eachData++) {
			let value = $('.db-table > tbody > tr:eq(' + $(htmlRows[eachRecord]).index() + ') > td:eq(' + eachData + ')').text()
			if ((!isNaN(value)) && value !== '') value = Number(value)
			jsonRecords[eachRecord][$('.db-table > thead > tr > th:eq(' + eachData + ')').text()] = value
		}
	}
	return jsonRecords
}

function JSONRecordsToHTMLRows(jsonRecords) {
	var html = ''
	var id = null
	for (var eachRecord = 0; eachRecord < jsonRecords.length; eachRecord++) {
		id = jsonRecords[eachRecord].ID
		html += '<tr id="' + id + '"><td class="read-only">\
		<input type="checkbox" id="bulk-apply-' + id + '" class="display-none toggle">\
		<label for="bulk-apply-' + id + '" class="checkbox-icon line-icon"></label>\
		<img src="/icons/delete.svg" class="delete line-icon" title="Delete this record from the database">\
		<img src="/icons/undo.svg" class="undo display-none-important line-icon" title="Undo all changes to this record">\
		</td>'
		Object.entries(jsonRecords[eachRecord]).forEach( ([key, value]) => {
			if (key !== 'ID') html += '<td class="td-padding">' + value + '</td>'
		})
		html += '</tr>'
	}
	return html
}

function WriteTable(jsonRecords) {
	if (jsonRecords.length === 0) { return '' }
	var html = '<thead><tr><th id="bulk-ops-icons" class="line-height-0">\
	<input type="checkbox" id="bulk-select-all" class="display-none toggle">\
	<img src="/icons/refresh.svg" class="refresh line-icon" title="Refresh this table from the database">\
	<label for="bulk-select-all" class="checkbox-icon line-icon" title="Select all records in table"></label>\
	<img src="/icons/delete-all.svg" class="delete-all line-icon" title="Delete all selected rows from database">\
	<img src="/icons/undo-all.svg" class="undo-all line-icon" title="Undo all changes to selected records">\
	</th>'
	
	Object.keys(jsonRecords[0]).forEach( (key) => {
		if (key !== 'ID') html += '<th>' + key + '</th>'
	})
	html += '</tr></thead><tbody>' + JSONRecordsToHTMLRows(jsonRecords) + '</tbody>'
	
	return html
}

function SmartInput(cell) {
	var fieldName = $('.db-table > thead > tr > th:eq(' + $(cell).index() + ')').text()
	var type = 'text'
	var min = ''
	var max = ''
	var checked = ''
	if (fieldName.match(/(q(uanti)?ty|num(ber)?|c(ou)?nt)/i)) {
		type = 'number'
		min = 0
	} else if (fieldName.match(/ed$|fl(a)?g/i)) {
		type = 'checkbox'
		if (parseInt($(cell).text())) checked = 'checked'
	}

	return '<input type="' + type + '" min="' + min + '" max="' + max + '" ' + checked + ' value="' + $(cell).text() + '" class="smart-input">'
}

// ------------------------------------------------------------------------------------------------//
// ----------------------------------- KEYBOARD SHORTCUTS -----------------------------------------//
// ------------------------------------------------------------------------------------------------//
// TODO
// Arrow key navigation within cells accepts edits to the cell and moves to corresponding next cell
// Tab key accepts edits to the cell and moves to the next editable cell
// Shift+Tab key accepts edits to the cell and moves to the previous editable cell

// Escape key cancels any edits to the cell and exits

// Enter key accepts edits to cell and exits

