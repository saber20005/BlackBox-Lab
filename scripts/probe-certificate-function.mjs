import {randomBytes} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

export const VERIFY_FUNCTION_URL='https://us-central1-black-box-lab.cloudfunctions.net/verifyIssuedCertificate';

export async function probeCertificateVerifier(fetcher=fetch,id=randomBytes(16).toString('hex')) {
  if(!/^[0-9a-f]{32}$/.test(id))throw Error('invalid-probe-id');
  const response=await fetcher(VERIFY_FUNCTION_URL+'?id='+id,{
    method:'GET',redirect:'manual',signal:AbortSignal.timeout(8000),
    cache:'no-store',headers:{Accept:'application/json'},
  });
  const type=String(response.headers.get('content-type')||'').toLowerCase();
  // HTML 404 means an un-deployed function, NOT a valid unknown certificate.
  if(response.status!==404||!type.includes('application/json'))throw Error('certificate-verifier-not-deployed-or-unhealthy');
  let body;
  try{body=await response.json();}
  catch{throw Error('certificate-verifier-invalid-response');}
  if(!body||body.status!=='not-found'||body.valid!==false)throw Error('certificate-verifier-invalid-response');
  return {ready:true,httpStatus:404,notFound:true};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{
    const outcome=await probeCertificateVerifier();
    console.log('Verified Cloud Function response contract:',JSON.stringify(outcome));
  }catch(error){
    console.error('Certificate verifier is NOT confirmed deployed:',error?.message);
    process.exitCode=1;
  }
}
