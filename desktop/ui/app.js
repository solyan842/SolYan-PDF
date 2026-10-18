(() => {
  const { categories, tools } = window.SOLYAN_TOOL_CATALOG;
  const categoryNav = document.getElementById('category-nav');
  const popularGrid = document.getElementById('popular-grid');
  const allGrid = document.getElementById('all-tools-grid');
  const convertList = document.getElementById('convert-list');
  const organizeList = document.getElementById('organize-list');
  const search = document.getElementById('tool-search');
  const homeView = document.getElementById('home-view');
  const toolsView = document.getElementById('tools-view');
  const emptyState = document.getElementById('empty-state');
  const toolCount = document.getElementById('tool-count');
  const toolsTitle = document.getElementById('tools-title');
  const toolsEyebrow = document.getElementById('tools-eyebrow');
  const toolsSubtitle = document.getElementById('tools-subtitle');
  const toast = document.getElementById('toast');
  const byCategory = new Map(categories.map(c => [c.id, c]));
  const icons = window.SOLYAN_PHOSPHOR;
  if (!icons) throw new Error('Pinned offline SVG icon assets missing');

  const routes = { merge: './merge.html', repair: './repair.html', 'extract-images': './extract-images.html', info: './info.html', 'active-content': './active-content.html', attachments: './attachments.html', 'remove-images': './remove-images.html', sanitize: './sanitize.html', linearize: './linearize.html', decompress: './decompress.html', compress: './transform.html?tool=compress', flatten: './transform.html?tool=flatten', 'image-opt': './transform.html?tool=image-opt', protect: './security-transform.html?tool=protect', unlock: './security-transform.html?tool=unlock', 'remove-signature': './remove-signature.html', permissions: './permissions.html', 'remove-annotations': './remove-annotations.html', 'unlock-forms': './unlock-forms.html', 'remove-blank': './remove-blank.html', 'page-labels': './page-labels.html', 'pdf-text': './poppler-convert.html?tool=text', 'pdf-html': './poppler-convert.html?tool=html', 'pdf-xml': './poppler-convert.html?tool=xml', 'pdf-cbz': './poppler-convert.html?tool=cbz', 'pdf-svg': './poppler-convert.html?tool=svg', 'pdf-ps': './poppler-convert.html?tool=ps', 'pdf-eps': './poppler-convert.html?tool=eps', portfolio: './portfolio.html', sign: './sign.html', pdfa: './pdfa.html', 'verify-signature': './sign.html?mode=verify', 'word-pdf': './office-convert.html?tool=word-pdf', 'excel-pdf': './office-convert.html?tool=excel-pdf', 'ppt-pdf': './office-convert.html?tool=ppt-pdf', 'odf-pdf': './office-convert.html?tool=odf-pdf', 'rtf-pdf': './office-convert.html?tool=rtf-pdf', 'pdf-word': './office-convert.html?tool=pdf-word', 'pdf-ppt': './office-convert.html?tool=pdf-ppt', 'ocr-pdf': './ocr.html', 'ocr-image': './ocr.html', 'edit-pdf': './workspace.html' };
  let activeCategory = 'all';
  function card(tool) {
    const pending = !routes[tool.id];
    return `<button class="tool-card${pending ? ' is-pending' : ''}" data-tool="${tool.id}" title="${tool.name}"${pending ? ' aria-description="Chưa có màn hình xử lý trong bản Windows này"' : ''}><span class="tool-icon tone-${tool.tone || 'blue'}">${icons.tool(tool.id, tool.category)}</span><span class="tool-body"><span class="tool-name">${tool.name}</span><span class="tool-desc">${tool.desc}</span>${pending ? '<span class="tool-status">Chưa khả dụng</span>' : ''}</span><span class="tool-arrow">›</span></button>`;
  }
  function mini(tool) {
    return `<button class="mini-item" data-tool="${tool.id}"><span class="mini-dot tone-${tool.tone || 'blue'}">${icons.mini(tool.id, tool.category)}</span><span>${tool.name}</span>${routes[tool.id] ? '' : '<span class="mini-status">Sắp có</span>'}<span>›</span></button>`;
  }
  document.querySelectorAll('[data-nav-icon]').forEach(node => {
    node.innerHTML = icons.nav(node.dataset.navIcon);
  });
  categoryNav.innerHTML = categories.map(c => `<button class="nav-item" data-category="${c.id}"><span class="nav-icon">${icons.category(c.id)}</span>${c.label}</button>`).join('');
  popularGrid.innerHTML = tools.filter(t => t.popular).slice(0, 10).map(card).join('');
  convertList.innerHTML = tools.filter(t => t.category === 'convert').slice(0, 5).map(mini).join('');
  organizeList.innerHTML = tools.filter(t => t.category === 'organize').slice(0, 5).map(mini).join('');
  function setNavActive(target) { document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active')); if (target) target.classList.add('active'); }
  function showHome(target) { activeCategory = 'all'; search.value = ''; homeView.classList.add('active-view'); toolsView.classList.remove('active-view'); setNavActive(target || document.querySelector('[data-filter="home"]')); }
  function renderTools(query = '') { const q = query.trim().toLocaleLowerCase('vi'); let filtered = tools; if (activeCategory !== 'all') filtered = filtered.filter(t => t.category === activeCategory); if (q) filtered = filtered.filter(t => `${t.name} ${t.desc} ${byCategory.get(t.category)?.label || ''}`.toLocaleLowerCase('vi').includes(q)); allGrid.innerHTML = filtered.map(card).join(''); toolCount.textContent = `${filtered.length} công cụ`; emptyState.hidden = filtered.length !== 0; }
  function showTools(category = 'all', target = null) { activeCategory = category; homeView.classList.remove('active-view'); toolsView.classList.add('active-view'); const meta = byCategory.get(category); toolsEyebrow.textContent = meta ? 'NHÓM CÔNG CỤ' : 'TẤT CẢ CÔNG CỤ'; toolsTitle.textContent = meta ? meta.label : 'Tất cả công cụ'; toolsSubtitle.textContent = meta ? `Mọi công cụ ${meta.label.toLocaleLowerCase('vi')} đều ở cùng một nơi.` : 'Chọn đúng việc cần làm. Mọi công cụ đều có thể tìm bằng Ctrl + K.'; renderTools(search.value); if (target) setNavActive(target); }
  function launchTool(toolId) { if (routes[toolId]) { window.location.href = routes[toolId]; return; } const tool = tools.find(t => t.id === toolId); if (!tool) return; toast.textContent = `${tool.name}: đã có trong catalog; sẽ nối vào engine hiện có theo thứ tự desktop V1.`; toast.classList.add('show'); clearTimeout(window.__solyanToastTimer); window.__solyanToastTimer = window.setTimeout(() => toast.classList.remove('show'), 2400); }
  document.addEventListener('click', e => { const toolButton=e.target.closest('[data-tool]'); if(toolButton)return launchTool(toolButton.dataset.tool); const categoryButton=e.target.closest('[data-category]'); if(categoryButton)return showTools(categoryButton.dataset.category,categoryButton.classList.contains('nav-item')?categoryButton:null); const filter=e.target.closest('[data-filter]'); if(filter){const value=filter.dataset.filter;if(value==='home')return showHome(filter);if(value==='all')return showTools('all',filter);if(value==='recent'){showTools('all',filter);toolsTitle.textContent='Gần đây';toolsSubtitle.textContent='Tệp và công cụ bạn vừa sử dụng sẽ xuất hiện ở đây.';return}if(value==='favorite'){showTools('all',filter);toolsTitle.textContent='Yêu thích';toolsSubtitle.textContent='Ghim công cụ dùng thường xuyên để mở trong một lần bấm.';return}if(value==='settings'){toast.textContent='Cài đặt desktop sẽ được nối ở D1C.';toast.classList.add('show');return}} if(e.target.closest('[data-show-all]'))showTools('all',document.querySelector('[data-filter="all"]')); });
  search.addEventListener('input',()=>{if(!toolsView.classList.contains('active-view'))showTools('all',document.querySelector('[data-filter="all"]'));renderTools(search.value)});
  document.addEventListener('keydown',e=>{if(e.ctrlKey&&e.key.toLowerCase()==='k'){e.preventDefault();search.focus();search.select()}if(e.key==='Escape'&&document.activeElement===search){search.value='';search.blur();if(toolsView.classList.contains('active-view'))renderTools('')}});
})();
