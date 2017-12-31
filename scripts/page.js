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

$.get('main', function( data ) {
	$('main').html(data)
	$.get('getRecords', function ( jsonRecords ) {
		if (jsonRecords.errno) { alert('Error: ' + jsonRecords.errno + '\nMessage: ' + jsonRecords.message) }
		else { $('.db-table').html(WriteTable(jsonRecords)) }
	})
})

$('body').on('click', '.create', () => {
	$.get('create', function( jsonRecord ) {
		if (jsonRecord.errno) { alert('Error: ' + jsonRecord.errno + '\nMessage: ' + jsonRecord.message) }
		else { $('.db-table > tbody > tr:last-child').after(JSONRecordsToHTMLRows(jsonRecord))}
	})
})

// When row-wise bulk checkbox is toggle, update bulk operations icons
// TODO
var checkedRows = 0
// If checkedRows = 0 then remove icons otherwise show them in empty field at top of table

var trackedRecords = []
var editingID = null
$('body').on('dblclick touchend', '.db-table > tbody > tr > td', function() {
	if (!dragging) EditRowValue(this)
	dragging = false
})

$('body').on('focusout', '.db-table > tbody > tr > td', function() {
	UpdateTrackedRecords(this)
})

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
	// TODO
	
}

function UpdateTrackedRecords(rowValue) {
	$(rowValue).removeAttr('contenteditable')

	var id = $(rowValue).closest('tr').attr('id')
	var matchedRecord = null
	for (var eachRecord = 0; eachRecord < trackedRecords.length; eachRecord++) {
		if (trackedRecords[eachRecord].ID === id) matchedRecord = trackedRecords[eachRecord]
	}
	var currentRecord = HTMLRowToJSONRecord($(rowValue).closest('tr'))
	var dataChanged = false
	for (eachValue in matchedRecord) {
		if (currentRecord[eachValue] !== matchedRecord[eachValue]) dataChanged = true
	}
	if (!dataChanged) { trackedRecords.pop() }
	FlagRowChanged($(rowValue.closest('tr'), dataChanged))
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
	for (var eachRecord = 0; eachRecord < jsonRecords.length; eachRecord++) {
		// Checkbox needs implemented in empty <td> element
		// Delete icon needs implemented in the empty <td> element
		// TODO
		html += '<tr id="' + jsonRecords[eachRecord].ID + '"><td></td>'
		Object.entries(jsonRecords[eachRecord]).forEach( ([key, value]) => {
			if (key !== 'ID') html += '<td>' + value + '</td>'
		})
		html += '</tr>'
	}
	return html
}

function WriteTable(jsonRecords) {
	if (jsonRecords.length === 0) { return '' }
	var html = '<thead><tr><th></th>'
	
	Object.keys(jsonRecords[0]).forEach( (key) => {
		if (key !== 'ID') html += '<th>' + key + '</th>'
	})
	html += '</thead></tr><tbody>' + JSONRecordsToHTMLRows(jsonRecords) + '</tbody>'
	
	return html
}

var dragging = false
$('body').on('touchmove', '.db-table > tbody > tr > td', () => { dragging = true })

