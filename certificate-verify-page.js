import { CERTIFICATE_ID_PATTERN, checkIssuedCertificate, normalizedCertificateId } from './certificate-verify-core.js';

const form = document.getElementById('verify-form');
const input = document.getElementById('verify-id');
const submit = document.getElementById('verify-submit');
const status = document.getElementById('verify-result');
const details = document.getElementById('verify-details');
let requestCounter = 0;

async function verify() {
  const id = normalizedCertificateId(input.value);
  const counter = ++requestCounter;
  details.hidden = true;
  status.dataset.state = 'pending';
  if (!CERTIFICATE_ID_PATTERN.test(id)) {
    status.textContent = 'صيغة الرقم غير صحيحة. يُقبل فقط رقم إصدار مكوّن من 32 حرفًا سداسيًا صغيرًا.';
    status.dataset.state = 'bad-id';
    return;
  }
  submit.disabled = true;
  status.textContent = 'جارٍ الاتصال بسجل الإصدار الموثوق…';
  const result = await checkIssuedCertificate(id);
  if (counter !== requestCounter) return;
  submit.disabled = false;
  status.dataset.state = result.state;
  if (result.state === 'verified') status.textContent = 'سجل صادر وصالح حاليًا: تحققت خدمة الخادم من رقم هذه الشهادة.';
  else if (result.state === 'revoked') status.textContent = 'شهادة صادرة سابقًا ولكن تم إلغاؤها. لا تعتبر صالحة الآن.';
  else if (result.state === 'not-found') status.textContent = 'لا يوجد سجل إصدار لهذا الرقم في قاعدة الشهادات الخادمية. لا تعتبره شهادة موثّقة.';
  else status.textContent = 'تعذّر التحقق من السجل حاليًا. قد تكون خدمة Firebase لم تُنشر بعد؛ لا يمكن الجزم بصحة الشهادة.';
  if (!result.certificate) return;
  const certificate = result.certificate;
  document.getElementById('verify-issuer').textContent = certificate.issuer === 'blackbox' ? 'BLACKBOX Lab' : 'CyberTrace';
  document.getElementById('verify-group').textContent = certificate.groupTitle;
  document.getElementById('verify-date').textContent =
    new Intl.DateTimeFormat('ar', { dateStyle: 'long' }).format(new Date(certificate.issuedAt));
  document.getElementById('verify-code').textContent = certificate.certificateId;
  details.hidden = false;
}

form.addEventListener('submit', event => {
  event.preventDefault();
  void verify();
});
const fromLink = new URL(location.href).searchParams.get('id');
if (fromLink && CERTIFICATE_ID_PATTERN.test(fromLink)) {
  input.value = fromLink;
  void verify();
}
