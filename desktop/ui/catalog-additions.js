(() => {
  const catalog = window.SOLYAN_TOOL_CATALOG;
  if (!catalog?.tools) return;
  const permissions = catalog.tools.find(tool => tool.id === 'permissions');
  if (permissions) permissions.desc = 'Kiểm tra mã hóa và permission của tài liệu';
  const additions = [
    { id:'remove-annotations', name:'Xóa chú thích', desc:'Xóa comment/markup, tùy chọn bỏ annotation không phải form', category:'edit', icon:'⌫', tone:'red' },
    { id:'unlock-forms', name:'Mở khóa biểu mẫu', desc:'Mở lại trường form readonly/locked và XFA readOnly', category:'edit', icon:'▤', tone:'green' }
  ];
  for (const tool of additions) {
    if (!catalog.tools.some(existing => existing.id === tool.id)) catalog.tools.push(tool);
  }
})();
