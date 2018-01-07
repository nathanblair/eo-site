// ------------------------------------------------------------------------------------------------//
// ------------------------------------------- GLOBALS --------------------------------------------//
// ------------------------------------------------------------------------------------------------//
var trackedRecords = []
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
$('body').on('dblclick touchend', '.db-table > tbody > tr > td', (eventArgs) => { EditCellValue(eventArgs.currentTarget); dragging = false })

// ------------------------------------ Leave table cell edit -------------------------------------//
$('body').on('focusout', '.db-table > tbody > tr > td', (eventArgs) => {
	$(eventArgs.currentTarget).removeAttr('contenteditable')
	var id = $(eventArgs.currentTarget).closest('tr').attr('id')
	RemoveTrackedRecords([id], LeaveCellRemoveCondition)
	ToggleRowCheckByChangeState(id)
	// Need to implement and test apply/update operation
	// Need to implement showing and hiding icons (single and bullk rows)
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
	$('.db-table tbody tr').remove()
	$.getJSON('getRecords', function(jsonRecords) {
		if (jsonRecords["errno"]) { ThrowJSONError(jsonRecords) }
		else { $('.db-table > tbody').html(JSONRecordsToHTMLRows(jsonRecords))}
		trackedRecords = []
	})
})

// ------------------------------------- Undo icon clicked ---------------------------------------//
$('body').on('click', '.undo, .undo-all', (eventArgs) => {
	var idList = CreateIDListOfSelectedContext(eventArgs.target)
	if (idList === '') return
	var idArray = idList.split(',')

	if (confirm('Are you sure you want to undo changes to these ' + idArray.length + ' record(s)?')) {
		RemoveTrackedRecords(idArray, OpRemoveCondition, UndoRowChangeByID)
	}
})

// ------------------------------------- Create icon clicked --------------------------------------//
$('body').on('click', '.create', (eventArgs) => {
	$.getJSON('create', function( jsonRecords ) {
		if (jsonRecords["errno"]) { ThrowJSONError(jsonRecords) }
		else { $('.db-table > tbody > tr:last-child').after(JSONRecordsToHTMLRows(jsonRecords))}
	})
})

// ------------------------------------- Delete icon clicked -------------------------------------//
$('body').on('click', '.delete, .delete-all', (eventArgs) => {
	var idList = CreateIDListOfSelectedContext(eventArgs.target)
	if (idList === '') return
	var idArray = idList.split(',')

	if (confirm('Are you sure you want to delete these ' + idArray.length + ' record(s)?')) {
		$.post('delete', idList, function(returnedList) {
			if (returnedList["errno"]) { ThrowJSONError(returnedList) }
			else {
				var successList = ProcessIDList(returnedList, idArray)
				DeleteRecordsFromTable(successList)
				UpdateCheckedRows()
				RemoveTrackedRecords(successList, OpRemoveCondition)
			}
		}, 'text')
	}
})

// ----------------------------------- Apply icon clicked ---------------------------------------//
$('body').on('click', '.apply, .apply-all', (eventArgs) => {
	var idList = CreateIDListOfSelectedContext(eventArgs.target)
	if (idList === '') return
	var idArray = idList.split(',')

	if (confirm('Are you sure you want to apply changes made to these ' + idArray.length + ' record(s)?')) {
		$.post('update', idList, function(returnedList) {
			if (returnedList["errno"]) { ThrowJSONError(returnedList) }
			else {
				var successList = ProcessIDList(returnedList, idArray)
				RemoveTrackedRecords(successList, OpRemoveCondition, ApplyRowChangeByID)
			}
		})
	}
})

// ------------------------------------------------------------------------------------------------//
// ------------------------------------------- CALLBACKS ------------------------------------------//
// ------------------------------------------------------------------------------------------------//
function EditCellValue(cell) {
	if (dragging || !Editable(cell)) return
	$(cell).attr('contenteditable', 'true').focus()
	AddTrackedRecords($(cell).closest('tr').attr('id'))
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

function LeaveCellRemoveCondition(id, originalRecord) {
	var newRecord = HTMLRowsToJSONRecords($(GetRowSelector([id])))[0]
	for(eachProperty in originalRecord) {
		if (originalRecord[eachProperty] !== newRecord[eachProperty]) return false
	}
	return true
}

function OpRemoveCondition(id, originalRecord) {
	return id === originalRecord.ID
}

function UndoRowChangeByID(id, originalRecord) {
	$(GetRowSelector([id])).replaceWith(JSONRecordsToHTMLRows([originalRecord]))
	$(GetRowSelector([id]) + ' .toggle').change()
}

function ApplyRowChangeByID(id, originalRecord) {
	// Update checkboxes
}

function DeleteRecordsFromTable(idArray) { $(GetRowSelector(idArray)).remove() }

// ------------------------------------------------------------------------------------------------//
// ------------------------------------------- HELPERS --------------------------------------------//
// ------------------------------------------------------------------------------------------------//
function Editable(element) {
	if ($(element).hasClass('read-only')) return false
	return true
}

function GetRowSelector(idList) {
	var rowSelector = '.db-table > tbody > '
	for(var eachID = 0; eachID < idList.length; eachID++) {
		rowSelector += 'tr#' + idList[eachID] + ','
	}
	return rowSelector.replace(/,$/, '')
}

function ThrowJSONError(json) {
	alert(JSON.stringify(json))
}

function FindRecordInTrackedRecordsByID(id) {
	var index = null
	for (var eachRecord = 0; eachRecord < trackedRecords.length; eachRecord++) {
		if (trackedRecords[eachRecord].ID === id) { index = eachRecord; break }
	}
	return index
}

function CreateIDListOfSelectedContext(context) {
	var idList = ''
	if ($(context).closest('tr').parent()[0].tagName === 'TBODY') {
		idList = $(context).closest('tr').attr('id')
	} else if ($(context).closest('tr').parent()[0].tagName === 'THEAD') {
		$('.db-table tbody tr.checked').each(function(index, element) {
			idList += $(this).attr('id') + ','
		})
		idList = idList.replace(/,$/, '')
	}
	return idList
}

function ToggleRowCheckByChangeState(id) {
	var state = false
	if(FindRecordInTrackedRecordsByID(id) !== null) { state = true }
	$(GetRowSelector([id]) + ' .toggle').prop('checked', state).change()
}

function ProcessIDList(errorList, idList) {
	var successList = []
	for(var eachID = 0; eachID < idList.length; eachID++) {
		var match = false
		for (var eachError = 0; eachError < errorList.length; eachError++) {
			if (idList[eachID] === errorList[eachError]) { match = true; break }
		}
		if (!match) { successList.push(idList[eachID]); }
	}
	return successList
}

function AddTrackedRecords(id) {
	if (FindRecordInTrackedRecordsByID(id) === null) trackedRecords = trackedRecords.concat(HTMLRowsToJSONRecords($(GetRowSelector([id]))))
}

function RemoveTrackedRecords(removeList, TestCondition, Callback = null) {
	for(var outerIndex = 0; outerIndex < removeList.length; outerIndex++) {
		for (var innerIndex = trackedRecords.length - 1; innerIndex >= 0; innerIndex--) {
			if (TestCondition(removeList[outerIndex], trackedRecords[innerIndex])) {
				if (Callback) Callback(removeList[outerIndex], trackedRecords[innerIndex])
				trackedRecords.splice(innerIndex, 1)
			}
		}
	}
}

function ToggleRowIcons(idList) {
	for(var eachID = 0; eachID < idList.length; eachID++) {
		if (FindRecordInTrackedRecordsByID(eachID) !== null) {
			// Show icons
		} else {
			// Hide icons
		}
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
		<img src="/icons/apply.svg" class="apply line-icon" title="Apply all changes to this record to database">\
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
	<img src="/icons/apply-all.svg" class="apply-all line-icon" title="Apply all changes to selected records to database">\
	<img src="/icons/undo-all.svg" class="undo-all line-icon" title="Undo all changes to selected records">\
	</th>'
	
	Object.keys(jsonRecords[0]).forEach( (key) => {
		if (key !== 'ID') html += '<th>' + key + '</th>'
	})
	html += '</tr></thead><tbody>' + JSONRecordsToHTMLRows(jsonRecords) + '</tbody>'
	
	return html
}
