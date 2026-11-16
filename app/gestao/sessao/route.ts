import {NextRequest,NextResponse} from 'next/server';
import {verifiedReader} from '../../security/management-access';
import {adminCookieName} from '@/lib/admin-server-auth';
const headers={'Cache-Control':'no-store'};
export async function POST(request:NextRequest){
 if(request.headers.get('origin')!==request.nextUrl.origin)return NextResponse.json({error:'Origem inválida.'},{status:403,headers});
 const token=/^Bearer (\S+)$/.exec(request.headers.get('authorization')??'')?.[1];
 if(!await verifiedReader(token))return NextResponse.json({error:'Acesso negado.'},{status:403,headers});
 const response=new NextResponse(null,{status:204,headers});
 response.cookies.set(adminCookieName,token!,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/admin',maxAge:3600});
 return response;
}
