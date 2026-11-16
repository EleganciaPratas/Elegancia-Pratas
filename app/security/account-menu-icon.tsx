import type {ReactNode} from 'react';
export default function AccountMenuIcon({name}:{name:'switch'|'shield'|'store'|'chevron'|'arrow'}){
 const paths:Record<string,ReactNode>={
 switch:<><path d="M4 7h15l-3-3M20 17H5l3 3"/><path d="M19 7l-3 3M5 17l3-3"/></>,
 shield:<><path d="m12 3 8 3v6c0 5-8 9-8 9S4 17 4 12V6z"/><path d="m8.5 12 2.5 2.5 4.5-5"/></>,
 store:<><path d="M3 9h18l-2-5H5zM4 9v11h16V9M9 20v-7h6v7"/></>,
 chevron:<path d="m8 10 4 4 4-4"/>,
 arrow:<path d="m10 7 5 5-5 5"/>
 };
 return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}
