import {createClient} from '@supabase/supabase-js';

export async function verifiedReader(token:string|undefined){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!token||!url||!key)return false;
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:'Bearer '+token}}});
 const user=await db.auth.getUser(token);
 if(user.error||!user.data.user)return false;
 const context=await db.rpc('management_account_context');
 return !context.error&&context.data?.role==='consulta';
}
