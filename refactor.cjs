const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

// Replace body
html = html.replace(
  /<body class="bg-slate-100 font-\['Public_Sans',sans-serif\] min-h-screen flex items-center justify-center p-4">/, 
  '<body class="bg-slate-50 font-[\'Public_Sans\',sans-serif] min-h-screen m-0 p-0 text-slate-900">'
);

// Replace device wrapper
html = html.replace(
  /<div class="w-\[375px\] h-\[720px\] bg-white rounded-\[48px\] border-\[12px\] border-slate-900 shadow-2xl relative flex flex-col overflow-hidden">/, 
  '<div class="w-full max-w-md mx-auto bg-white min-h-screen relative flex flex-col shadow-2xl overflow-x-hidden md:border-x border-slate-200">'
);

// Remove notch
html = html.replace(
  /<!-- Notch -->\s*<div class="absolute top-0 left-1\/2 -translate-x-1\/2 w-32 h-6 bg-slate-900 rounded-b-2xl z-20"><\/div>/, 
  ''
);

// Remove Status Bar
html = html.replace(
  /<!-- Status Bar -->[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/, 
  ''
);

// Remove all Home Indicators
html = html.replace(
  /<!-- Home Indicator -->[\s\S]*?<\/div>/g, 
  ''
);

fs.writeFileSync('index.html', html);
console.log('Refactoring complete');
