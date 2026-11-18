// Destinado ao CI ou sandbox descartável em nuvem. Nunca aponta para Supabase.
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
if(process.env.FINANCE_FIXTURE_PORT!=='55439')throw Error('FINANCE_FIXTURE_PORT=55439 obrigatório.');
const base=['-X','-qAt','-h','127.0.0.1','-p','55439','-U','postgres','-d','finance_fixture','-v','ON_ERROR_STOP=1'];
function run(command,args,options={}){const r=spawnSync(command,args,{cwd:root,encoding:'utf8',env:{...process.env,PGOPTIONS:'-c finance.fixture=cloud-disposable'},...options});if(r.status!==0)throw Error(r.stderr||r.stdout||'Falha no teste PostgreSQL');return r.stdout;}
const tables=run('psql',[...base,'-c',"select count(*) from information_schema.tables where table_schema in ('public','auth')"]);
if(Number(tables.trim())!==0)throw Error('Crie uma fixture vazia; este comando não apaga bancos existentes.');
const functionHashes=()=>JSON.parse(run('psql',[...base,'-c',"select json_object_agg(oid::regprocedure::text,md5(pg_get_functiondef(oid))) from pg_proc where pronamespace='public'::regnamespace and prokind='f'"]));
for(const path of ['tests/fixtures/finance-bootstrap.sql','docs/sql/financeiro-socios.review.sql','tests/fixtures/finance-loss-access.sql','docs/sql/financeiro-fechamento-prejuizos.review.sql','docs/sql/financeiro-estornos-devolucoes.review.sql']){const before=path.includes('estornos-devolucoes')?functionHashes():null;run('psql',[...base,'-f',path]);if(before){const after=functionHashes();for(const key of Object.keys(before))if(before[key]!==after[key])throw Error('RPC anterior alterada: '+key);}}

run(process.execPath,['--test','tests/finance-adjustments-postgres.test.mjs'],{stdio:'inherit'});
