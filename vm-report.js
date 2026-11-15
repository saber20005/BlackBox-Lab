// Browser-only report parser. No network, storage, host access or execution.
export function parseVMReport(input) {
  if (typeof input !== 'string' || input.length > 256_000) throw new Error('حجم التقرير غير مقبول');
  let data;
  try { data = JSON.parse(input); } catch { throw new Error('الملف ليس JSON صالحًا'); }
  if (!data || data.ok !== true || data.mode !== 'read-only' || !Array.isArray(data.machines) || data.machines.length > 100) {
    throw new Error('هذا ليس تقرير فحص BLACKBOX صالحًا');
  }
  return data.machines.map(vm => {
    if (!vm || typeof vm.name !== 'string' || vm.name.length > 200 || typeof vm.id !== 'string' ||
      !/^[0-9a-fA-F-]{36}$/.test(vm.id) || typeof vm.state !== 'string' || vm.state.length > 60 ||
      !Array.isArray(vm.adapters) || vm.adapters.length > 8) throw new Error('بيانات جهاز غير صالحة');
    const adapters = vm.adapters.map(adapter => {
      if (!adapter || !Number.isInteger(adapter.slot) || adapter.slot < 1 || adapter.slot > 8 ||
          typeof adapter.attachment !== 'string' || adapter.attachment.length > 60) throw new Error('بيانات شبكة غير صالحة');
      return {slot: adapter.slot, attachment: adapter.attachment};
    });
    const isolated = adapters.length > 0 && adapters.every(a => ['hostonly','intnet'].includes(a.attachment.toLowerCase()));
    return {name:vm.name, state:vm.state, adapters, isolated};
  });
}
