(function() {
  chrome.storage.local.get(['theme'], (result) => {
    const theme = result.theme || 'dark';
    const link = document.createElement('link');
    link.id = 'theme-link';
    link.rel = 'stylesheet';
    link.href = `../themes/theme-${theme}.css`;
    link.onload = () => {
      const p = document.getElementById('fouc-preventer');
      if (p) p.remove();
    };
    document.head.appendChild(link);
  });
})();
