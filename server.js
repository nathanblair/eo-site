const port = 8080
const http = require('http')
const urllib = require('url')
const fslib = require('fs')
const pathlib = require('path')
var dblib = require('./database')

function GetDBPath(host) {
	var dbPath = pathlib.normalize(pathlib.dirname(require.main.filename)) + MapHostToPath(host)
	var dbFile = fslib.readdirSync(dbPath).filter(function(file) {
		return pathlib.extname(file) === '.db'
	})
	return dbPath + dbFile
}

function Create(db, table, record, response) {
	var sql = 'INSERT INTO ' + table + ' DEFAULT VALUES;'

	db.run(sql, function(error, createdRecord) {
		if (error) { db.close(); ReturnJSON(error, response) }
		else { GetRecords(db, table, 'ID=$id', {$id:this.lastID}, response) }
	})
}

function Update(db, table, recordsToUpdate, response) {
	var updatedRecords = []
	
	ReturnJSON({updatedRecords}, response)
}

function Delete(db, table, recordsToDelete, response) {
	var deletedRecords = []
	
	ReturnJSON({deletedRecords}, response)
}

function GetRecords(db, table, filter, params, response) {
	var json = {}
	var sql = 'SELECT * FROM ' + table
	if (filter !== '') sql += ' WHERE ' + filter
	sql += ';'

	db.all(sql, params || [], function(error, rows) {
		db.close()
		if (error) { ReturnJSON(error, response) } else { ReturnJSON(rows, response) }
	})
}

function GetMain(host, urlPath, response) {
	var urlPath = MapHostToPath(host) + urlPath + '.html'
	HandleResourceRequest(urlPath, response)
}

function MapHostToPath(host) {
	return '/' + host.domain + '/' + host.subdomain + '/'
}

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

function HandleDatabaseRequest(host, urlPath, urlQuery, action, response) {
	var records = []
	if (Object.keys(urlQuery).length !== 0) records = urlQuery.split(',')

	var dbPath = GetDBPath(host)
	dblib.Database(dbPath)
	var table = urlPath.replace(/^\/|\/.+/g, '')

	if (action === '/create') { Create(dblib.db, table, records, response) } 
	else if (action === '/update') { Update(dblib.db, table, records, response) }
	else if (action === '/delete') { Delete(dblib.db, table, records, response) }
	else if (action === '/getRecords') { GetRecords(dblib.db, table, '', null, response) }
}

function Router(request, response) {
	var host = ParseHost(request.headers.host)
	var parsedURL = urllib.parse(request.url, true)
	var urlPath = parsedURL.pathname
	var urlQuery = parsedURL.query
	if (urlPath.endsWith('/')) urlPath = '/' + host.domain + '/index.html'

	var action = urlPath.substr(urlPath.lastIndexOf('/'))
	if (action.includes('.')) { HandleResourceRequest(urlPath, response) }
	else if (action === '/main') { GetMain(host, urlPath, response) }
	else { HandleDatabaseRequest(host, urlPath, urlQuery, action, response) }
}

var server = http.createServer(Router)

server.listen(port)

console.log('Server listening on port: ' + port)
