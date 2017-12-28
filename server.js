const port = 8080
const http = require('http')
const urllib = require('url')
const fslib = require('fs')
const pathlib = require('path')

function Create(record, response) {
	// Create a new record and set error to false if it returns with no error
	var error = true

}

function BulkUpdate(recordsToUpdate, action, response) {
	// Update records and set error to false if it returns with no error
	var updatedRecords = []
	var error = true
	
}

function GetRecords(response) {
	// Get records and return them
	var records = []
	var error = true
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
		default:
			return 'text/plain'
	}
}

function HandleResourceRequest(urlPath, response) {
	var file = pathlib.normalize(pathlib.dirname(require.main.filename) + '/' + urlPath)
	fslib.readFile(file, function(error, fileContents) {
		var logMsg = 'Could not find: ' + file
		var statusCode = 500
		var contentType = GetContentTypeFromFile(file)
		if (!error) {
			logMsg = 'Replied with: ' + file
			statusCode = 200
		} else {
			fileContents = logMsg
			statusCode =  404
		}
		response.statusCode = statusCode
		response.setHeader('Content-Type', contentType)	
		response.write(fileContents)
		// console.log(logMsg)
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

	// console.log('Request at {' + host + '} for {' + urlPath + '} from {' + request.connection.remoteAddress + '}')

	var records = []
	if (Object.keys(urlQuery).length !== 0) records = urlQuery.split(',')

	var actionIndex = urlPath.lastIndexOf('/')
	var action = urlPath.substr(actionIndex)

	if (action === '/create') { Create(records, response) } 
	else if (action === '/delete' || action === 'update') { BulkUpdate(records, action, response) }
	else if (action === '/get') { GetRecords(response) }
	else if (action === '/main') { GetMain(host, urlPath, response) }
	else { HandleResourceRequest(urlPath, response) }
}

var server = http.createServer(Router)

server.listen(port)

console.log('Server listening on port: ' + port)
