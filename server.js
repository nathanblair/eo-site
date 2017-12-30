const port = 8080
const http = require('http')
const urllib = require('url')
const fslib = require('fs')
const pathlib = require('path')
var dblib = require('./database')

function GetDBPath(host) {
	var dbPath = pathlib.normalize(pathlib.dirname(require.main.filename)) + MapHostToPath(host, 2)
	var dbFile = fslib.readdirSync(dbPath).filter(function(file) {
		return pathlib.extname(file) === '.db'
	})
	return dbPath + dbFile
}

function Create(dbPath, table, record, response) {
	// Create a new record and set error to false if it returns with no error
	var createdRecord = null
	var json = {createdRecord}
	
	ReturnJSONData(json, response)
}

function BulkUpdate(dbPath, table, action, recordsToUpdate, response) {
	// Update records and set error to false if it returns with no error
	var updatedRecords = []

	var json = {updatedRecords}
	
	ReturnJSONData(json, response)
}

function GetRecords(dbPath, table, response) {
	var json = {}

	dblib.Database(dbPath)
	var sql = 'SELECT * FROM ' + table + ';'

	dblib.db.all(sql, {}, function(error, rows) {
		if (error) { json = error } else { json = rows }
		dblib.db.close()
		ReturnJSONData(json, response)
	})
}

function GetMain(host, urlPath, response) {
	var maxDomains = host.split('.').length - 1
	var urlPath = MapHostToPath(host, maxDomains) + urlPath + '.html'
	HandleResourceRequest(urlPath, response)
}

function MapHostToPath(host, maxDomains) {
	var hostSplit = host.split('.')
	var maxIndex = hostSplit.length

	var urlPath = '/'
	for (eachDomain = 0; eachDomain < maxDomains; eachDomain++) {
		urlPath = urlPath + hostSplit[maxIndex - (eachDomain + 2)] + '/'
	}

	return urlPath
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

function ReturnJSONData(json, response) {
	// Get string of json data
	var jsonString = JSON.stringify(json)

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

function Router(request, response) {
	var host = request.headers.host
	var parsedURL = urllib.parse(request.url, true)
	var urlPath = parsedURL.pathname
	var urlQuery = parsedURL.query
	if (urlPath.endsWith('/')) {
		urlPath = MapHostToPath(host, 1)
		urlPath += 'index.html'
	}

	var records = []
	if (Object.keys(urlQuery).length !== 0) records = urlQuery.split(',')
	var dbPath = GetDBPath(host)
	var table = urlPath.replace(/^\/|\/.+/g, '')

	var action = urlPath.substr(urlPath.lastIndexOf('/'))

	if (action === '/create') { Create(dbPath, table, records, response) } 
	else if (action === '/delete' || action === 'update') { BulkUpdate(dbPath, table, action, records, response) }
	else if (action === '/get') { GetRecords(dbPath, table, response) }
	else if (action === '/main') { GetMain(host, urlPath, response) }
	else { HandleResourceRequest(urlPath, response) }
}

var server = http.createServer(Router)

server.listen(port)

console.log('Server listening on port: ' + port)
