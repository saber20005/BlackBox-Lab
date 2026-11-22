// Public curriculum only. Never transfer auth, score or personal data across websites.
export const SUITE_PATHWAYS_VERSION = '2026-11-22.v1';
export const SUITE_PATHWAYS = Object.freeze([
  {
    "id": "identity",
    "title": "الهوية والأدلة",
    "description": "تحليل الدخول المشبوه وربط السجلات بسلامة الأدلة",
    "steps": [
      {
        "site": "cybertrace",
        "id": "INC-0417",
        "title": "تحقيق تسجيل دخول مشبوه"
      },
      {
        "site": "blackbox",
        "id": "logs",
        "title": "تحليل سجلات المصادقة"
      },
      {
        "site": "cybertrace",
        "id": "INC-1201",
        "title": "تحقيق إعادة استخدام الجلسة"
      },
      {
        "site": "blackbox",
        "id": "integrity",
        "title": "التحقق من سلامة الأدلة"
      }
    ]
  },
  {
    "id": "web",
    "title": "أمن تطبيقات الويب",
    "description": "الربط بين تحليل الحوادث والتدريب في مختبر معزول",
    "steps": [
      {
        "site": "cybertrace",
        "id": "INC-1101",
        "title": "تحليل حادثة حقن SQL"
      },
      {
        "site": "blackbox",
        "id": "webgoat",
        "title": "تدريب WebGoat"
      },
      {
        "site": "cybertrace",
        "id": "INC-1203",
        "title": "تحقيق صلاحيات الوصول"
      },
      {
        "site": "blackbox",
        "id": "headers",
        "title": "تدقيق ترويسات HTTP"
      }
    ]
  },
  {
    "id": "network",
    "title": "تحقيقات الشبكات",
    "description": "من أدلة DNS إلى فحص أهداف Host-Only مصرح بها",
    "steps": [
      {
        "site": "cybertrace",
        "id": "INC-1204",
        "title": "تحقيق DHCP وDNS"
      },
      {
        "site": "blackbox",
        "id": "recon",
        "title": "رسم نطاق الشبكة المعزولة"
      },
      {
        "site": "cybertrace",
        "id": "INC-1105",
        "title": "تحليل الحركة الجانبية"
      },
      {
        "site": "blackbox",
        "id": "nmap",
        "title": "تدريب Nmap الآمن"
      }
    ]
  },
  {
    "id": "email",
    "title": "الاستجابة للتصيد",
    "description": "تمييز الرسائل المشبوهة عن المؤشرات المثبتة",
    "steps": [
      {
        "site": "cybertrace",
        "id": "INC-0512",
        "title": "تحليل حملة تصيد"
      },
      {
        "site": "blackbox",
        "id": "email",
        "title": "قراءة SPF وDKIM وDMARC"
      },
      {
        "site": "cybertrace",
        "id": "INC-1208",
        "title": "تحقيق احتيال المورد"
      },
      {
        "site": "blackbox",
        "id": "logs",
        "title": "ربط المؤشرات بسجلات الدخول"
      }
    ]
  }
].map(p=>Object.freeze({...p,steps:Object.freeze(p.steps.map(s=>Object.freeze(s)))})));
export function suiteStepURL(step) {
 if(!SUITE_PATHWAYS.some(p=>p.steps.some(s=>s.site===step?.site&&s.id===step?.id))) throw new TypeError('Unknown learning step');
 const url=new URL(step.site==='blackbox'?'https://blackboxlab.dev/':'https://www.cybertracelab.dev/');
 if(step.site==='blackbox'){url.searchParams.set('view','tracks');url.searchParams.set('track',step.id);}
 else url.searchParams.set('case',step.id);
 return url.href;
}
export function localJourneyProgress(path,site,isDone){
 if(!SUITE_PATHWAYS.includes(path)||!['blackbox','cybertrace'].includes(site)||typeof isDone!=='function') throw new TypeError('Invalid learning progress');
 const local=path.steps.filter(s=>s.site===site);
 return Object.freeze({done:local.filter(s=>isDone(s.id)===true).length,total:local.length,remoteKnown:false,credentialEligible:false});
}
