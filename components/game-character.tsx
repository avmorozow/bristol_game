'use client';

export function GameCharacter({kind='bag',mood='idle',className='',alt=''}:{kind?:'bag'|'squirrel';mood?:'idle'|'caught'|'lost'|'happy'|'still';className?:string;alt?:string}){
 return <span className={`game-character character-${kind} character-${mood} ${className}`}><span className="character-pose"><img src={`/assets/${kind==='bag'?'bag-3d':'squirrel-3d'}.webp`} alt={alt} width={768} height={768} draggable={false}/></span></span>;
}

export type CharacterMoment={id:string;kind:'rescue'|'milestone';tap:number};
export function CharacterReaction({moment}:{moment:CharacterMoment}){
 return <div className={`character-reaction reaction-${moment.kind}`} aria-hidden="true" data-testid="character-reaction">
  {moment.kind==='rescue'?<><GameCharacter kind="squirrel" mood="still" className="retreating-squirrel"/><span className="reaction-caption">Пакет спасён!</span></>:<><span className="milestone-ring"/><span className="reaction-caption">{moment.tap} из 120!</span></>}
 </div>;
}
