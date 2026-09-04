import type {Metadata,Viewport} from 'next';
import './globals.css';
export const metadata:Metadata={other:{'codex-preview':'development'},title:'Бристоль — Собери пакет',description:'Тапай по пакету, остерегайся белки и забирай монеты. Игровая демонстрация «Бристоль».',icons:{icon:'/assets/bag.png'}};
export const viewport:Viewport={width:'device-width',initialScale:1,viewportFit:'cover',themeColor:'#381018'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="ru"><body>{children}</body></html>;}
