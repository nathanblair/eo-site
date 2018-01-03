// ------------------------------------------------------------------------------------------------//
// ------------------------------------------- PAGE INFO ------------------------------------------//
// ------------------------------------------------------------------------------------------------//
var dynamicTitle = ' Home'
var activeElement = '#'
if (window.location.pathname !== '/') {
	activeElement += window.location.pathname.replace(/^\/|\/$/g, '')
	dynamicTitle = ' ' + activeElement.substr(1)
} else {
	activeElement += window.location.hostname.split('.')[0]
}
$(activeElement).addClass('active')
document.title = document.title + dynamicTitle


// ------------------------------------------------------------------------------------------------//
// ------------------------------------------- EVENT TRACKING -------------------------------------//
// ------------------------------------------------------------------------------------------------//
$.get('main', function( data ) {
	$('main').html(data)
	$.getJSON('getRecords', function ( jsonRecords ) {
		if (jsonRecords.errno) { ThrowJSONError(jsonRecords) }
		else { $('.db-table').html(WriteTable(jsonRecords)) }
	})
})

$('body').on('click', '.refresh', (eventArgs) => {
	$('.db-table tbody tr').remove()
	$.getJSON('getRecords', function(jsonRecords) {
		if (jsonRecords.errno) { ThrowJSONError(jsonRecords) }
		else { $('.db-table > tbody').html(JSONRecordsToHTMLRows(jsonRecords))}
	})
})

$('body').on('click', '.create', (eventArgs) => {
	$.getJSON('create', function( jsonRecord ) {
		if (jsonRecord.errno) { ThrowJSONError(jsonRecord) }
		else { $('.db-table > tbody > tr:last-child').after(JSONRecordsToHTMLRows(jsonRecord))}
	})
})

$('body').on('click', '.delete-all, .delete', (eventArgs) => {
	var idList = GetIDs(eventArgs.target, 'delete', 'delete-all')

	if (confirm('Are you sure you want to delete these ' + idList.split(',').length + ' record(s)?')) {
		$.post('delete', idList, function(jsonRecords) {
			if (jsonRecords.errno) { ThrowJSONError(jsonRecords) }
			else { DeleteRecordsFromTable(JSON.parse(jsonRecords)) }
		}, 'text')
	}
})

$('body').on('click', '.undo, .undo-all', (eventArgs) => {
	var idList = GetIDs(eventArgs.target, 'undo', 'undo-all')
	idList = idList.split(',')

	if (confirm('Are you sure you want to undo changes to these ' + idList.length + ' record(s)?')) {
		for (var eachID = 0; eachID < idList.length; eachID++) {
			for (var eachRecord = trackedRecords.length - 1; eachRecord >= 0; eachRecord--) {
				if (idList[eachID] === trackedRecords[eachRecord].ID) {
					$('.db-table > tbody > tr#' + idList[eachID]).replaceWith(JSONRecordsToHTMLRows([trackedRecords[eachRecord]]))
					trackedRecords.splice(eachRecord, 1)
				}
			}
		}
		$('.db-table > tbody > tr .toggle').change()
	}
})

var trackedRecords = []
var editingID = null
$('body').on('dblclick touchend', '.db-table > tbody > tr > td', function() {
	if (!dragging && Editable(this)) EditRowValue(this)
	dragging = false
})

$('body').on('focusout', '.db-table > tbody > tr > td', function() {
	$(this).removeAttr('contenteditable')
	UpdateTrackedRecords(this.closest('tr'))
})

$('body').on('change', '.db-table > thead > tr .toggle', (eventArgs) => {
	$('.db-table > thead > tr .checkbox-icon').removeAttr('style')
	if (eventArgs.currentTarget == eventArgs.target) {
		$('.db-table > tbody > tr .toggle').prop('checked', eventArgs.currentTarget.checked).change()
	}
})

$('body').on('change', '.db-table > tbody > tr .toggle', (eventArgs) => { UpdateCheckedRows(eventArgs) })

// ------------------------------------------------------------------------------------------------//
// ------------------------------------------- FUNCTIONS ------------------------------------------//
// ------------------------------------------------------------------------------------------------//
function Editable(element) {
	if ($(element).hasClass('read-only')) return false
	return true
}

function EditRowValue(rowValue) {
	var id = $(rowValue).closest('tr').attr('id')
	
	var match = false
	for (var eachRecord = 0; eachRecord < trackedRecords.length; eachRecord++) {
		if (trackedRecords[eachRecord].ID === id) match = true
	}
	if (!match) trackedRecords.push(HTMLRowToJSONRecord($(rowValue).closest('tr')))
	
	$(rowValue).attr('contenteditable', 'true')
	$(rowValue).focus()
}

function FlagRowChanged(row, dataChanged) {
	// Toggle the flags on or off for the row depending on dataChanged state
	// Also check to see if the flags are already shown first
	if (!dataChanged) {
		var index = null
		for (var eachRecord = 0; eachRecord < trackedRecords.length; eachRecord ++) {
			if (trackedRecords[eachRecord].ID === $(row).attr('id')) {
				index = eachRecord
				break
			}
		}
		if (index !== null) trackedRecords.splice(index, 1)
		$(row).find('.toggle').prop('checked', false).change()
	}
	else {
		$(row).find('.toggle').prop('checked', true).change()
	}
}

function GetIDs(target, singleClass, multiClass) {
	var idList = ''
	if ($(target).hasClass(singleClass)) {
		idList = $(target).closest('tr').attr('id')
	} else if ($(target).hasClass(multiClass)) {
		$('.db-table tbody tr.checked').each(function(index, element) {
			idList += $(this).attr('id') + ','
		})
		idList = idList.replace(/,$/, '')
	}
	return idList
}

function UpdateTrackedRecords(htmlRow) {
	var id = $(htmlRow).attr('id')
	var matchedRecord = null
	for (var eachRecord = 0; eachRecord < trackedRecords.length; eachRecord++) {
		if (trackedRecords[eachRecord].ID === id) matchedRecord = trackedRecords[eachRecord]
	}
	var currentRecord = HTMLRowToJSONRecord($(htmlRow))
	var dataChanged = false
	for (var eachValue in matchedRecord) {
		if (currentRecord[eachValue] !== matchedRecord[eachValue]) dataChanged = true
	}
	FlagRowChanged($(htmlRow.closest('tr')), dataChanged)
}

function UpdateCheckedRows(eventArgs) {
	if (eventArgs.target.checked) {
		$(eventArgs.target).closest('tbody > tr').addClass('checked')
	} else if (!eventArgs.target.checked) {
		$(eventArgs.target).closest('tbody > tr').removeClass('checked')
	}
	if ($('.db-table > tbody > tr.checked').length === $('.db-table > tbody > tr').length) {
		$('.db-table > thead > tr .toggle').prop('checked', true)
		$('.db-table > thead > tr .checkbox-icon').removeAttr('style')

	} else if ($('.db-table > tbody > tr.checked').length > 0) {
		$('.db-table > thead > tr .toggle').prop('checked', false)
		$('.db-table > thead > tr .checkbox-icon').css('background-image', 'url(/icons/indeterminate.svg')
	}
	else {
		$('.db-table > thead > tr .toggle').prop('checked', false)
		$('.db-table > thead > tr .checkbox-icon').removeAttr('style')
	}
	ToggleBulkOpsIcons($('.db-table > tbody > tr.checked').length)
}

function ToggleBulkOpsIcons(checkedRowsCount) {
	if (checkedRowsCount) {
		// Show if not already shown
	} else {
		// Hide if not already hidden
	}
}

function DeleteRecordsFromTable(idList) {
	var selectorArray = ''
	for (var eachID in idList) {
		selectorArray += '#' + idList[eachID] + ','
	}
	selectorArray = selectorArray.replace(/,$/, '')
	$(selectorArray).remove()
}

function HTMLRowToJSONRecord(htmlRows) {
	var jsonRecord = {}

	for (var eachRow = 0; eachRow < htmlRows.length; eachRow++) {
		jsonRecord.ID = $(htmlRows[eachRow]).attr('id')
		var tdElements = $(htmlRows[eachRow]).children('td')
		for (var eachData = 1; eachData < tdElements.length; eachData++) {
			var header = $('.db-table th:eq(' + eachData + ')').text()
			jsonRecord[header] = tdElements[eachData].textContent
		}
	}
	return jsonRecord
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

function ThrowJSONError(json) {
	alert(JSON.stringify(json))
}

var dragging = false
$('body').on('touchmove', '.db-table > tbody > tr > td', () => { dragging = true })

