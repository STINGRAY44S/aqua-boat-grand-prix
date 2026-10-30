'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase';

type Race = {
  id: string; title: string; status: 'recruiting'|'open'|'running'|'finished';
  created_at: string; host_id: string; max_boats: number; entry_count?: number;
};

const BETS = [
  {id:'win', name:'単勝', picks:1, odds:5},
  {id:'place', name:'複勝', picks:1, odds:2.2},
  {id:'exacta', name:'2連単', picks:2, odds:12},
  {id:'quinella', name:'2連複', picks:2, odds:6},
  {id:'trifecta', name:'3連単', picks:3, odds:45},
  {id:'trio', name:'3連複', picks:3, odds:10},
  {id:'wide', name:'拡連複', picks:2, odds:3.5},
] as const;

export default function Home() {
  const [supabase] = useState(() => supabaseBrowser());
  const [session, setSession] = useState<any>(null);
  const [email,setEmail] = useState('');
  const [password,setPassword] = useState('');
  const [balance,setBalance] = useState(0);
  const [races,setRaces] = useState<Race[]>([]);
  const [selected,setSelected] = useState('');
  const [betType,setBetType] = useState<(typeof BETS)[number]['id']>('trifecta');
  const [picks,setPicks] = useState([1,2,3]);
  const [stake,setStake] = useState(100);
  const [message,setMessage] = useState('');
  const [raceTitle,setRaceTitle] = useState('みんなのオンラインカップ');
  const [busy,setBusy] = useState(false);

  const currentBet = useMemo(()=>BETS.find(x=>x.id===betType)!,[betType]);

  async function refresh() {
    const {data:{session:s}} = await supabase.auth.getSession();
    setSession(s);
    if (!s) { setBalance(0); return; }
    const [{data:profile},{data:rs}] = await Promise.all([
      supabase.from('profiles').select('medals').eq('id',s.user.id).maybeSingle(),
      supabase.from('races').select('id,title,status,created_at,host_id,max_boats').order('created_at',{ascending:false}).limit(30)
    ]);
    setBalance(profile?.medals ?? 10000);
    const withCounts = await Promise.all((rs ?? []).map(async (r:any)=>{
      const {count} = await supabase.from('entries').select('*',{count:'exact',head:true}).eq('race_id',r.id);
      return {...r,entry_count:count ?? 0};
    }));
    setRaces(withCounts);
    if (!selected && withCounts.length) setSelected(withCounts[0].id);
  }

  useEffect(()=>{
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return;
    refresh();
    const {data:{subscription}} = supabase.auth.onAuthStateChange(()=>{refresh();});
    const channel = supabase.channel('race-updates')
      .on('postgres_changes',{event:'*',schema:'public',table:'races'},()=>refresh())
      .on('postgres_changes',{event:'*',schema:'public',table:'entries'},()=>refresh())
      .subscribe();
    return ()=>{subscription.unsubscribe(); supabase.removeChannel(channel);};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  async function auth(mode:'signup'|'login') {
    setBusy(true); setMessage('');
    const result = mode==='signup'
      ? await supabase.auth.signUp({email,password})
      : await supabase.auth.signInWithPassword({email,password});
    setBusy(false);
    if (result.error) setMessage(result.error.message);
    else setMessage(mode==='signup' ? '登録しました。メール確認が有効な場合は確認メールを開いてください。' : 'ログインしました。');
    await refresh();
  }
  async function logout(){ await supabase.auth.signOut(); setSession(null); setMessage('ログアウトしました。'); }
  async function createRace(){
    if(!session) return setMessage('レース開催にはログインしてください。');
    setBusy(true);
    const {error}=await supabase.from('races').insert({title:raceTitle,host_id:session.user.id,status:'recruiting',max_boats:6});
    setBusy(false); setMessage(error?.message ?? 'レースを開催しました！'); await refresh();
  }
  async function joinRace(){
    if(!session || !selected) return setMessage('ログインしてレースを選択してください。');
    setBusy(true);
    const {error}=await supabase.from('entries').insert({race_id:selected,user_id:session.user.id,boat_no:1+Math.floor(Math.random()*6)});
    setBusy(false); setMessage(error?.message ?? '出走登録しました。'); await refresh();
  }
  async function buyTicket(){
    if(!session || !selected) return setMessage('ログインしてレースを選択してください。');
    if(new Set(picks.slice(0,currentBet.picks)).size!==currentBet.picks) return setMessage('艇番が重複しています。');
    setBusy(true);
    const {error}=await supabase.rpc('buy_ticket',{p_race_id:selected,p_bet_type:betType,picks:picks.slice(0,currentBet.picks),p_stake:stake});
    setBusy(false); setMessage(error?.message ?? '舟券を購入しました！'); await refresh();
  }
  async function startRace(){
    if(!session || !selected) return;
    setBusy(true);
    const {error}=await supabase.rpc('run_demo_race',{p_race_id:selected});
    setBusy(false); setMessage(error?.message ?? 'レース結果が確定しました！'); await refresh();
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return <main className="shell"><header className="hero"><p className="eyebrow">ONLINE BOAT RACING</p><h1>AQUA BOAT<br/><span>GRAND PRIX</span></h1><p>みんなで遊ぶ、無料メダル制オンラインボートレース。</p></header><section className="panel"><h2>あと一歩でオンライン化！</h2><p>Supabaseを接続すると、アカウント登録・10,000枚付与・レース開催・参加・舟券購入が有効になります。</p><p>同梱のREADME.mdに沿ってSupabaseを設定してください。</p></section></main>;
  }

  return <main className="shell">
    <header className="hero">
      <div className="topline"><span className="live-dot"/> ONLINE GAME <span className="tag">FREE MEDALS</span></div>
      <h1>AQUA BOAT<br/><span>GRAND PRIX</span></h1>
      <p>みんなで開催。みんなで出走。みんなで予想。</p>
      <div className="heroStats"><div><small>YOUR MEDALS</small><strong>{balance.toLocaleString()} 枚</strong></div><div><small>RACES OPEN</small><strong>{races.filter(r=>r.status!=='finished').length} レース</strong></div></div>
    </header>

    <section className="panel authPanel">
      <div className="sectionTitle"><div><small>PLAYER ACCOUNT</small><h2>プレイヤー登録・ログイン</h2></div>{session && <button className="ghost" onClick={logout}>ログアウト</button>}</div>
      {session ? <p className="success">ログイン中：{session.user.email}</p> : <div className="authForm"><input type="email" placeholder="メールアドレス" value={email} onChange={e=>setEmail(e.target.value)}/><input type="password" placeholder="パスワード（8文字以上推奨）" value={password} onChange={e=>setPassword(e.target.value)}/><div className="buttonRow"><button disabled={busy||!email||password.length<6} onClick={()=>auth('signup')}>無料で新規登録</button><button className="secondary" disabled={busy||!email||password.length<6} onClick={()=>auth('login')}>ログイン</button></div><small>新規登録すると無料ゲーム内メダル10,000枚でスタート。</small></div>}
      {message && <p className="notice">{message}</p>}
    </section>

    <section className="grid2">
      <section className="panel"><div className="sectionTitle"><div><small>CREATE EVENT</small><h2>レースを開催</h2></div><span className="icon">＋</span></div><p className="muted">あなたが主催者になって、6艇立てレースを募集。</p><input value={raceTitle} onChange={e=>setRaceTitle(e.target.value)} maxLength={48} placeholder="レース名"/><button className="full" disabled={busy||!session||!raceTitle.trim()} onClick={createRace}>レースを開催する</button></section>
      <section className="panel"><div className="sectionTitle"><div><small>JOIN EVENT</small><h2>レースに参加</h2></div><span className="icon">↗</span></div><p className="muted">募集中のレースを選んで出走登録。</p><select value={selected} onChange={e=>setSelected(e.target.value)}><option value="">レースを選択</option>{races.map(r=><option key={r.id} value={r.id}>{r.title}</option>)}</select><button className="full secondary" disabled={busy||!session||!selected} onClick={joinRace}>出走登録する</button></section>
    </section>

    <section className="panel"><div className="sectionTitle"><div><small>LIVE RACE BOARD</small><h2>開催中のレース</h2></div><button className="ghost" onClick={refresh}>更新 ↻</button></div>
      {races.length===0?<p className="muted">まだレースがありません。最初のレースを開催しよう！</p>:<div className="raceList">{races.map(r=><button key={r.id} className={`raceItem ${selected===r.id?'chosen':''}`} onClick={()=>setSelected(r.id)}><span><b>{r.title}</b><small>{new Date(r.created_at).toLocaleString('ja-JP')} ・ {r.entry_count ?? 0}/6艇</small></span><em>{r.status==='finished'?'終了':r.status==='running'?'レース中':'募集中'}</em></button>)}</div>}
    </section>

    <section className="panel"><div className="sectionTitle"><div><small>VIRTUAL TICKETS</small><h2>ゲーム内舟券</h2></div><span className="tag">NO CASH VALUE</span></div>
      <p className="muted">選択したレースに、無料ゲーム内メダルで予想を購入。</p>
      <div className="ticketGrid">{BETS.map(b=><button key={b.id} className={betType===b.id?'ticket active':'ticket'} onClick={()=>setBetType(b.id)}><b>{b.name}</b><small>参考倍率 ×{b.odds}</small></button>)}</div>
      <div className="pickRow">{[0,1,2].slice(0,currentBet.picks).map((i)=><label key={i}>{i+1}着予想<select value={picks[i]} onChange={e=>setPicks(old=>old.map((v,j)=>j===i?Number(e.target.value):v))}>{[1,2,3,4,5,6].map(n=><option key={n} value={n}>{n}号艇</option>)}</select></label>)}</div>
      <label className="stakeLabel">購入メダル<select value={stake} onChange={e=>setStake(Number(e.target.value))}>{[100,300,500,1000].map(n=><option key={n} value={n}>{n.toLocaleString()}枚</option>)}</select></label>
      <button className="full" disabled={busy||!session||!selected||balance<stake} onClick={buyTicket}>舟券を購入する</button>
      <p className="tiny">※倍率は開発用の固定サンプル。現実のオッズ・現金・換金・譲渡には対応しません。</p>
    </section>

    <section className="panel"><div className="sectionTitle"><div><small>HOST CONTROL</small><h2>主催者用レース進行</h2></div></div><p className="muted">選択中レースのデモ結果を確定します。公開運用では主催者権限・締切・監査ログを追加してください。</p><button className="full secondary" disabled={busy||!session||!selected} onClick={startRace}>デモレースを実行・結果確定</button></section>
    <footer>© AQUA BOAT GRAND PRIX ONLINE <span>無料ゲーム内メダル専用</span></footer>
  </main>;
}
