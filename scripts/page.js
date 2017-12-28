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

$.get('main', function( data ) { $('main').html(data) })
