(() => {
  const catalog = window.SOLYAN_TOOL_CATALOG;
  if (!catalog?.tools) return;
  const permissions = catalog.tools.find(tool => tool.id === 'permissions');
  if (permissions) permissions.desc = 'Kiểm tra mã hóa và permission của tài liệu';
  const additions = [
    { id:'remove-annotations', name:'Xóa chú thích', desc:'Xóa comment/markup, tùy chọn bỏ annotation không phải form', category:'edit', icon:'⌫', tone:'red' },
    { id:'unlock-forms', name:'Mở khóa biểu mẫu', desc:'Mở lại trường form readonly/locked và XFA readOnly', category:'edit', icon:'▤', tone:'green' },
    { id:'pdf-text', name:'PDF sang TXT', desc:'Xuất văn bản UTF-8 bằng Poppler', category:'convert', icon:'TXT', tone:'gray' },
    { id:'pdf-html', name:'PDF sang HTML', desc:'Xuất HTML một tệp có CSP an toàn', category:'convert', icon:'H', tone:'orange' },
    { id:'pdf-xml', name:'PDF sang XML', desc:'Xuất cấu trúc pdf2xml và tọa độ text', category:'convert', icon:'XML', tone:'blue' },
    { id:'pdf-cbz', name:'PDF sang CBZ', desc:'Render trang thành PNG và đóng gói CBZ', category:'convert', icon:'CBZ', tone:'purple' },
    { id:'pdf-svg', name:'PDF sang SVG', desc:'Xuất một hoặc nhiều trang thành SVG', category:'convert', icon:'SVG', tone:'green' }
  ];
  for (const tool of additions) {
    if (!catalog.tools.some(existing => existing.id === tool.id)) catalog.tools.push(tool);
  }
})();
