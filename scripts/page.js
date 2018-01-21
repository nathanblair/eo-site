// ------------------------------------------------------------------------------------------------//
// ------------------------------------------- GLOBALS --------------------------------------------//
// ------------------------------------------------------------------------------------------------//
var trackedRecords = []
var queued = 0
var dragging = false

// Still working on testing update/rollback operations
// Then need to decide on when to show and hide rollback icon
// Then can start implementing keyboard shortcuts

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
$('body').on('dblclick touchend', '.db-table > tbody > tr > td', (eventArgs) => {
	if (dragging || !Editable(eventArgs.currentTarget)) return
	var id = $(eventArgs.currentTarget).closest('tr').attr('id')

	if (FindRecordInTrackedRecords(id) === null) trackedRecords = trackedRecords.concat(HTMLRowsToJSONRecords($(GetRowSelector([id]))))
	$(eventArgs.currentTarget).attr('contenteditable', 'true').focus()
	dragging = false
})

// ------------------------------------ Leave table cell edit -------------------------------------//
$('body').on('focusout', '.db-table > tbody > tr > td', (eventArgs) => {
	UpdateOpStatus(true)
	var id = $(eventArgs.currentTarget).closest('tr').attr('id')
	if (RemoveTrackedRecords([id], LeaveCellRemoveCondition).length >= 1) {
		$(eventArgs.currentTarget).removeAttr('contenteditable')
		UpdateOpStatus(false)
		return;
	}
	var passedJSON = {'id':id, fields:{
		[$('.db-table > thead th:eq(' + $(eventArgs.currentTarget).index() + ')').text()]:
			parseInt($(eventArgs.currentTarget).text()) || $(eventArgs.currentTarget).text()
	}}
	$.post('update', JSON.stringify(passedJSON), (updates) => {
		if (updates["errno"] || updates.length > 1) { ThrowJSONError(updates) }
		else { $(eventArgs.currentTarget).text(Object.values(updates[0])[1]) }
		$(eventArgs.currentTarget).removeAttr('contenteditable')
		UpdateOpStatus(false)
	}, 'json')
})

// ------------------------------------- Checked state of row changed -----------------------------//
$('body').on('change', '.db-table > tbody > tr .toggle', (checkedContext) => { UpdateCheckedRows(checkedContext) })

// --------------------------------- Checked state of bulk icon changed ---------------------------//
$('body').on('change', '.db-table > thead > tr .toggle', (eventArgs) => {
	if (eventArgs.currentTarget == eventArgs.target) {
		$('.db-table > tbody > tr .toggle').prop('checked', eventArgs.currentTarget.checked).change()
	}
})

// ------------------------------------------------------------------------------------------------//
// ------------------------------------------ OP ACTIONS ------------------------------------------//
// ------------------------------------------------------------------------------------------------//
// ------------------------------------- Refresh icon clicked -------------------------------------//
$('body').on('click', '.refresh', (eventArgs) => {
	UpdateOpStatus(true)
	$('.db-table tbody tr').remove()
	$.getJSON('getRecords', function(jsonRecords) {
		if (jsonRecords["errno"]) { ThrowJSONError(jsonRecords) }
		else { $('.db-table > tbody').html(JSONRecordsToHTMLRows(jsonRecords))}
		trackedRecords = []
		UpdateOpStatus(false)
	})
})

// ------------------------------------- Undo icon clicked ---------------------------------------//
$('body').on('click', '.undo, .undo-all', (eventArgs) => {
	var idList = CreateIDListOfSelectedContext(eventArgs.target)
	var idArray = idList.split(',')
	var undoRecords = GetOriginalRecordValues(idArray)
	if (undoRecords.length === 0) { alert("There are no changes to roll back for a selected record!"); return }
	else if (undoRecords.length !== idArray.length) { alert("There were " + (idArray.length - undoRecords.length) + " record(s) selected that will not be undone\nThese record(s) do not have rollback entries") }
	if (confirm('Are you sure you want to undo changes to these ' + undoRecords.length + ' record(s)?')) {
		UpdateOpStatus(true, undoRecords.length)
		PostUndoUpdate(undoRecords)
	}
})

// ------------------------------------- Create icon clicked --------------------------------------//
$('body').on('click', '.create', (eventArgs) => {
	UpdateOpStatus(true)
	$.getJSON('create', function( jsonRecords ) {
		if (jsonRecords["errno"]) { ThrowJSONError(jsonRecords) }
		else { $('.db-table > tbody > tr:last-child').after(JSONRecordsToHTMLRows(jsonRecords))}
		UpdateOpStatus(false)
	})
})

// ------------------------------------- Delete icon clicked -------------------------------------//
$('body').on('click', '.delete, .delete-all', (eventArgs) => {
	var idList = CreateIDListOfSelectedContext(eventArgs.target)
	if (idList === '') return
	var idArray = idList.split(',')
	
	if (confirm('Are you sure you want to delete these ' + idArray.length + ' record(s)?')) {
		UpdateOpStatus(true)
		$.post('delete', idList, function(returnedList) {
			if (returnedList["errno"]) { ThrowJSONError(returnedList) }
			else {
				var successList = ProcessIDList(returnedList, idArray)
				DeleteRecordsFromTable(successList)
				UpdateCheckedRows()
				RemoveTrackedRecords(successList, OpRemoveCondition)
			}
			UpdateOpStatus(false)
		}, 'text')
	}
})

// ------------------------------------------------------------------------------------------------//
// ------------------------------------------- CALLBACKS ------------------------------------------//
// ------------------------------------------------------------------------------------------------//
function LeaveCellRemoveCondition(id, originalRecord) {
	var newRecord = HTMLRowsToJSONRecords($(GetRowSelector([id])))[0]
	for (var eachProperty in originalRecord) { if (originalRecord[eachProperty] !== newRecord[eachProperty]) return false }
	return true
}

function OpRemoveCondition(id, originalRecord) { return id === parseInt(originalRecord.ID) }

function PostUndoUpdate(undoRecords) {
	if (undoRecords.length === 0) return;
	$.post('update', JSON.stringify(undoRecords[undoRecords.length - 1]), (returnedRecords) => {
		if (returnedRecords["errno"]) { ThrowJSONError(returnedRecords) }
		RemoveTrackedRecords([returnedRecords[0].ID], OpRemoveCondition, UndoRowChange)
		undoRecords.pop()
		UpdateOpStatus(false)
		PostUndoUpdate(undoRecords)
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
}

function DeleteRecordsFromTable(idArray) { $(GetRowSelector(idArray)).remove() }

// ------------------------------------------------------------------------------------------------//
// ------------------------------------------- HELPERS --------------------------------------------//
// ------------------------------------------------------------------------------------------------//
function Editable(element) { if ($(element).hasClass('read-only')) { return false } else { return true } }

function GetRowSelector(idList) {
	var rowSelector = '.db-table > tbody > '
	for (var eachID = 0; eachID < idList.length; eachID++) { rowSelector += 'tr#' + idList[eachID] + ',' }
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

function CreateIDListOfSelectedContext(context) {
	var idList = ''
	if ($(context).closest('tr').parent()[0].tagName === 'TBODY') { idList = $(context).closest('tr').attr('id') }
	else if ($(context).closest('tr').parent()[0].tagName === 'THEAD') {
		$('.db-table tbody tr.checked').each(function(index, element) { idList += $(this).attr('id') + ',' })
		idList = idList.replace(/,$/, '')
	}
	return idList
}

function UpdateOpStatus(status, increment = null) {
	if (status && increment) {queued += increment } else if (status) { queued++ } else { queued-- }
	$('#queue-count > span').text(queued)
	if ((queued > 0) && $('#queue-count').hasClass('display-none')) { $('#queue-count').removeClass('display-none') }
	else if (!queued && !($('#queue-count').hasClass('display-none'))) { $('#queue-count').addClass('display-none') }
}

function ProcessIDList(errorList, idList) {
	var successList = []
	for (var eachID = 0; eachID < idList.length; eachID++) {
		var match = false
		for (var eachError = 0; eachError < errorList.length; eachError++) {
			if (idList[eachID] === errorList[eachError]) { match = true; break }
		}
		if (!match) successList.push(idList[eachID])
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

function GetOriginalRecordValues(idList) {
	var changedRecords = []
	for (var eachID = 0; eachID < idList.length; eachID++) {
		let trackedIndex = FindRecordInTrackedRecords(idList[eachID])
		if (trackedIndex === null) continue
		var fieldChanges = {}
		var record = HTMLRowsToJSONRecords($(GetRowSelector([idList[eachID]])))[0]
		var compareRecord = trackedRecords[trackedIndex]
		for (var eachProperty in record) {
			if (record[eachProperty] !== compareRecord[eachProperty]) {
				fieldChanges[eachProperty] = parseInt(compareRecord[eachProperty]) || compareRecord[eachProperty]
			}
		}
		changedRecords.push({'id':idList[eachID], 'fields':fieldChanges})
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

	for (var eachRow = 0; eachRow < htmlRows.length; eachRow++) {
		jsonRecords[eachRow] = {}
		jsonRecords[eachRow].ID = $(htmlRows[eachRow]).attr('id')
		var tdElements = $(htmlRows[eachRow]).children('td')
		for (var eachData = 1; eachData < tdElements.length; eachData++) {
			var header = $('.db-table th:eq(' + eachData + ')').text()
			jsonRecords[eachRow][header] = tdElements[eachData].textContent
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
		<img src="/icons/undo.svg" class="undo line-icon" title="Undo all changes to this record">\
		</td>'
		Object.entries(jsonRecords[eachRecord]).forEach( ([key, value]) => {
			if (key !== 'ID') html += '<td>' + value + '</td>'
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
