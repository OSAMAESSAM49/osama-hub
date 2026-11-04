// Applies saved theme and language before first paint, so there is no flash on load.
(function () {
  var prefs = {}
  try { prefs = JSON.parse(localStorage.getItem('osama-hub:prefs') || '{}') } catch (e) { /* storage unavailable */ }
  var theme = prefs.theme || 'system'
  var dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
  var lang = prefs.language === 'en' ? 'en' : 'ar'
  document.documentElement.lang = lang
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
})()
