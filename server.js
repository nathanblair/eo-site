const port = 8080
const http = require('http')
const urllib = require('url')
const fslib = require('fs')
const pathlib = require('path')
var dblib = require('./database')

// Get run-level of program; execute server on port 80 if root permissions are granted;
// Otherwise, execute server on port 8080

function GetDBPath(host) {
	var dbPath = pathlib.normalize(pathlib.dirname(require.main.filename)) + MapHostToPath(host)
	var dbFile = fslib.readdirSync(dbPath).filter(function(file) {
		return pathlib.extname(file) === '.db'
	})
	return dbPath + dbFile
}

function Create(db, table, response) {
	var sql = 'INSERT INTO ' + table + ' DEFAULT VALUES;'

	db.run(sql, function(error, createdRecord) {
		if (error) { db.close(); ReturnJSON(error, response) }
		else { GetRecords(db, table, response, 'WHERE ID=$id', {$id:this.lastID}) }
	})
}

function Update(db, table, recordToUpdate, response) {
	var updateRecord = JSON.parse(recordToUpdate)
	var updateClause = ''
	for (var eachField in updateRecord.fields) {
		updateClause += eachField + '=$' + eachField + ','
	}
	updateClause = updateClause.replace(/,$/, '')
	var sql = "UPDATE " + table + " SET " + updateClause + " WHERE ID=$id;"
	var params = Object.values(updateRecord.fields)
	params.push(updateRecord.id)

	db.run(sql, params, function(error) {
		if (error) { db.close(); ReturnJSON(error, response) }
		else { GetRecords(db, table, response, 'WHERE ID IN ($id)', updateRecord.id, Object.keys(updateRecord.fields)) }
	})
}

function Delete(db, table, idArray, response) {
	var idParamList = ''
	idArray = JSON.parse(idArray)
	for (var eachID = 0; eachID < idArray.length; eachID++) {idParamList += '?,'}
	idParamList = idParamList.replace(/,$/, '')
	var sql = 'DELETE FROM ' + table + ' WHERE ID IN (' + idParamList + ');'

	db.run(sql, idArray, function(error) {
		if (error) { db.close(); ReturnJSON(error, response) }
		else { GetRecords(db, table, response, 'WHERE ID IN (' + idParamList + ')', idArray, ['ID']) }
	})
}

function GetFields(db, table, response) {
	var sql = 'SELECT sql FROM sqlite_master WHERE type="table" AND tbl_name="' + table + '"'
	
	db.all(sql, function(error, rows) {
		db.close(); if (error) { ReturnJSON(error, response) }
		else {
			var fields = {}
			var fieldNames = []
			var fieldTypes = []
			var fieldCriteria = {}
			var readOnly = []
			var regexSql = rows[0].sql

			regexSql.match(/`\w+`/g).forEach((element) => { fieldNames.push(element.replace(/`/g, '')) })
			regexSql.match(/`\s\w+/g).forEach((element) => { fieldTypes.push(element.replace(/`\s/g, '')) })
			var criteriaFound = /CHECK\(\w+ IN \(.+\,?\)\)/g.exec(regexSql)
			if (criteriaFound) { criteriaFound.forEach((element) => {
				let matchArray = /CHECK\((\w+) IN \((.+)\,?\)\)/.exec(element)
				let field = matchArray[1]
				let range = matchArray[2].split(',')
				fieldCriteria[field] = range
			})}
			var readOnlyFound = /FOREIGN KEY\(`\w+`\)/g.exec(regexSql)
			if (readOnlyFound) { readOnlyFound.forEach((element) => { readOnly.push(/FOREIGN KEY\((`\w+)\)/g.exec(element)[1]) }) }
			for (let eachField = 0; eachField < fieldNames.length; eachField++) {
				fields[fieldNames[eachField]] = {}
				fields[fieldNames[eachField]].type = fieldTypes[eachField]
				if (fieldNames[eachField] === 'ID') { fields[fieldNames[eachField]].readOnly = true; continue }
				else { fields[fieldNames[eachField]].readOnly = false }
				for (let eachReadOnly = 0; eachReadOnly < readOnly.length; eachReadOnly++) {
					if (fieldNames[eachField] === readOnly[eachReadOnly]) {
						fields[fieldNames[eachField]].readOnly = true
						break
					}
				}
			}
			ReturnJSON(fields, response)
		}
	})
}

function GetRecords(db, table, response, filterClause = '', params = [], fields = '*') {
	var selectFields = ''
	if (fields !== '*') {
		for (var eachField = 0; eachField < fields.length; eachField++) { selectFields += fields[eachField] + ',' }
		selectFields = selectFields.replace(/,$/, '') }
	else { selectFields = fields }
	var sql = 'SELECT ' + selectFields + ' FROM ' + table + ' ' + filterClause + ';'

	db.all(sql, params, function(error, rows) { db.close(); if (error) { ReturnJSON(error, response) } else { ReturnJSON(rows, response) } })
}

function GetMain(host, urlPath, response) { HandleResourceRequest(MapHostToPath(host) + urlPath + '.html', response) }

function MapHostToPath(host) { return '/' + host.domain + '/' + host.subdomain + '/' }

function ParseHost(host) {
	var hostSplit = host.split('.')

	var port = hostSplit[hostSplit.length - 1].split(':')[1] || ''
	var tld = hostSplit[hostSplit.length - 1].split(':')[0] || ''
	var domain = hostSplit[hostSplit.length - 2] || ''
	var subdomain = hostSplit[hostSplit.length - 3] || ''

	return {'port': port, 'tld': tld, 'domain': domain, 'subdomain': subdomain}
}

function GetContentTypeFromFile(file) {
	switch (file.substr(file.lastIndexOf('.'))) {
		case '.html':
			return 'text/html'
		case '.css':
			return 'text/css'
		case '.js':
			return 'application/javascript'
		case '.png':
			return 'image/png'
		case '.jpeg':
			return 'image/jpeg'
		case '.svg':
			return 'image/svg+xml'
		default:
			return 'text/plain'
	}
}

function ReturnJSON(json, response) {
	var jsonString = JSON.stringify(json).replace(/(^["'])+|(["']$)+/g, '')

	response.setHeader('Content-Type', 'application/json')
	response.statusCode = 200

	response.write(jsonString)
	response.end()
}

function HandleResourceRequest(urlPath, response) {
	var file = pathlib.normalize(pathlib.dirname(require.main.filename) + '/' + urlPath)
	fslib.readFile(file, function(error, fileContents) {
		var statusCode = 500
		var contentType = GetContentTypeFromFile(file)
		if (!error) {
			statusCode = 200
		} else {
			fileContents = 'Could not find file ' + file
			statusCode =  404
		}
		response.statusCode = statusCode
		response.setHeader('Content-Type', contentType)	
		response.write(fileContents)
		response.end()
	})
}

function HandleDatabaseRequest(host, urlPath, response, action = 'getRecords', urlQuery = [], records = []) {
	var dbPath = GetDBPath(host)
	dblib.Database(dbPath)
	var table = urlPath.replace(/^\/|\/.+/g, '')

	if (action === 'create') { Create(dblib.db, table, response) } 
	else if (action === 'update') { Update(dblib.db, table, records, response) }
	else if (action === 'delete') { Delete(dblib.db, table, records, response) }
	else if (action === 'getFields') { GetFields(dblib.db, table, response) }
	else if (action === 'getRecords') { GetRecords(dblib.db, table, response, urlQuery) }
}

function Router(request, response) {
	var host = ParseHost(request.headers.host)
	var parsedURL = urllib.parse(request.url)
	var urlPath = parsedURL.pathname
	var urlQuery = parsedURL.query || ''
	var requestData = ''
	if (urlPath.endsWith('/')) urlPath = '/' + host.domain + '/index.html'
	var action = urlPath.substr(urlPath.lastIndexOf('/') + 1)

	if (request.method === 'POST') {
		request.on('data', (data) => requestData += data.toString() )
		request.on('end', () => HandleDatabaseRequest(host, urlPath, response, action, urlQuery, requestData))
		return
	} 
	
	if (action.includes('.')) { HandleResourceRequest(urlPath, response) }
	else if (action === 'main') { GetMain(host, urlPath, response) }
	else { HandleDatabaseRequest(host, urlPath, response, action, urlQuery) }
}

var server = http.createServer(Router)

server.listen(port)
