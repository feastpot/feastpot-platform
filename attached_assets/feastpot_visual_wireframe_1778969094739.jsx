import React, { useState } from "react";
import {
  Search,
  MapPin,
  Star,
  ShieldCheck,
  Clock,
  ShoppingBasket,
  Heart,
  User,
  Home,
  ReceiptText,
  SlidersHorizontal,
  CalendarDays,
  ChevronRight,
  CheckCircle2,
  Utensils,
  Users,
  Store,
  MessageCircle,
  Gift,
  Lock,
  Truck,
  ChefHat,
  CreditCard,
  Bell,
  HelpCircle,
  LogOut,
  Navigation,
  AlertTriangle,
  Soup,
  BadgeCheck,
  ClipboardList,
  WalletCards,
  Building2,
  PartyPopper,
  Baby,
  BriefcaseBusiness,
  Church,
  XCircle,
} from "lucide-react";
import { motion } from "framer-motion";

const brand = {
  green: "#00843D",
  greenDark: "#005C2B",
  gold: "#F6B400",
  red: "#E30613",
  black: "#070707",
  cream: "#FFFDF7",
  warm: "#FFF8E8",
};

const Button = ({ children, variant = "primary", className = "", ...props }) => {
  const styles = {
    primary: "bg-[#00843D] text-white hover:bg-[#005C2B] shadow-sm",
    gold: "bg-[#F6B400] text-black hover:bg-[#e4a500] shadow-sm",
    red: "bg-[#E30613] text-white hover:bg-red-700 shadow-sm",
    dark: "bg-black text-white hover:bg-stone-800 shadow-sm",
    secondary: "bg-white text-stone-950 border border-stone-200 hover:bg-stone-50",
    ghost: "bg-transparent text-stone-700 hover:bg-stone-100",
  };
  return (
    <button className={`inline-flex items-center justify-center rounded-2xl px-5 py-3 text-sm font-black transition ${styles[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
};

const Badge = ({ children, tone = "green" }) => {
  const tones = {
    green: "bg-green-50 text-[#00843D] border-green-100",
    gold: "bg-yellow-50 text-yellow-800 border-yellow-100",
    red: "bg-red-50 text-[#E30613] border-red-100",
    black: "bg-black text-white border-black",
    white: "bg-white text-stone-700 border-stone-200",
    grey: "bg-stone-100 text-stone-600 border-stone-200",
  };
  return <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-black ${tones[tone]}`}>{children}</span>;
};

const Logo = ({ compact = false }) => (
  <div className="flex items-center gap-2">
    <div className="relative h-9 w-10 shrink-0">
      <div className="absolute bottom-0 left-1 h-5 w-8 rounded-b-2xl rounded-t-md border-[3px] border-[#00843D] bg-white" />
      <div className="absolute bottom-1 left-2 h-4 w-6 overflow-hidden rounded-b-xl">
        <div className="absolute inset-y-0 left-0 w-1/3 bg-[#00843D]" />
        <div className="absolute inset-y-0 left-1/3 w-1/3 bg-[#F6B400]" />
        <div className="absolute inset-y-0 right-0 w-1/3 bg-[#E30613]" />
      </div>
      <div className="absolute bottom-5 left-1 h-2 w-8 rounded-full border-[3px] border-black bg-white" />
      <div className="absolute left-3 top-0 h-5 w-2 rounded-full bg-[#00843D] rotate-[22deg]" />
      <div className="absolute left-5 top-1 h-5 w-2 rounded-full bg-[#F6B400] rotate-[18deg]" />
      <div className="absolute left-7 top-2 h-4 w-2 rounded-full bg-[#E30613] rotate-[15deg]" />
    </div>
    {!compact && <div className="text-2xl font-black tracking-tight"><span className="text-[#00843D]">f</span><span className="text-[#F6B400]">e</span><span className="text-[#E30613]">a</span><span className="text-[#00843D]">s</span><span className="text-[#F6B400]">t</span><span className="text-black">pot</span></div>}
  </div>
);

const FoodImage = ({ label, className = "", variant = 0 }) => {
  const gradients = [
    "from-[#E30613] via-[#F6B400] to-[#00843D]",
    "from-[#00843D] via-[#F6B400] to-[#E30613]",
    "from-stone-950 via-[#E30613] to-[#F6B400]",
    "from-[#005C2B] via-[#00843D] to-[#F6B400]",
  ];
  return (
    <div className={`relative overflow-hidden rounded-3xl bg-gradient-to-br ${gradients[variant % gradients.length]} ${className}`}>
      <div className="absolute inset-0 opacity-35" style={{ backgroundImage: "radial-gradient(circle at 22% 25%, white 0 9%, transparent 10%), radial-gradient(circle at 75% 35%, #2b0a05 0 12%, transparent 13%), radial-gradient(circle at 50% 80%, white 0 8%, transparent 9%)" }} />
      <div className="absolute inset-4 rounded-full border-[18px] border-black/10" />
      {label && <div className="absolute bottom-4 left-4 right-4 rounded-2xl bg-white/92 p-3 shadow-sm backdrop-blur"><p className="text-sm font-black text-stone-950">{label}</p></div>}
    </div>
  );
};

const Header = ({ mobile = false }) => (
  <header className="border-b border-stone-100 bg-white/95 backdrop-blur-xl">
    <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 md:px-6">
      <Logo />
      <div className="hidden items-center gap-2 rounded-full bg-stone-50 px-4 py-2 text-xs font-black text-stone-700 md:flex"><MapPin size={15} className="text-[#00843D]"/> London, SW1A 1AA <ChevronRight size={14} className="rotate-90"/></div>
      <nav className="hidden items-center gap-7 text-sm font-black text-stone-700 lg:flex">
        <a>Categories</a><a>Offers</a><a>FeastPass <span className="ml-1 rounded-full bg-[#00843D] px-2 py-0.5 text-[10px] text-white">New</span></a>
      </nav>
      <div className="flex items-center gap-3 text-stone-950"><User size={20}/><Heart size={20}/><div className="relative"><ShoppingBasket size={21}/><span className="absolute -right-2 -top-2 grid h-5 w-5 place-items-center rounded-full bg-[#E30613] text-[10px] font-black text-white">2</span></div></div>
    </div>
  </header>
);

const PanelTitle = ({ num, title }) => (
  <div className="mb-4 flex items-center gap-3">
    <span className="grid h-8 w-8 place-items-center rounded-full bg-black text-sm font-black text-white">{num}</span>
    <h2 className="text-2xl font-black tracking-tight text-black">{title}</h2>
  </div>
);

const TrustStrip = () => (
  <div className="grid gap-3 rounded-3xl border border-stone-100 bg-white p-4 shadow-sm md:grid-cols-4">
    {[[Truck,"Fast delivery","From local kitchens","green"],[ShieldCheck,"Trusted kitchens","Quality you can trust","green"],[Star,"Top rated","Loved by our community","gold"],[CreditCard,"Secure payments","Safe checkout","red"]].map(([Icon,title,body,tone]) => (
      <div key={title} className="flex items-center gap-3"><div className={`grid h-11 w-11 place-items-center rounded-2xl ${tone==='green'?'bg-green-50 text-[#00843D]':tone==='gold'?'bg-yellow-50 text-[#F6B400]':'bg-red-50 text-[#E30613]'}`}><Icon size={22}/></div><div><p className="text-sm font-black text-black">{title}</p><p className="text-xs font-bold text-stone-500">{body}</p></div></div>
    ))}
  </div>
);

const SectionHeader = ({ eyebrow, title, body }) => (
  <div className="mb-7 max-w-3xl">
    {eyebrow && <p className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-[#00843D]">{eyebrow}</p>}
    <h2 className="text-3xl font-black tracking-tight text-black md:text-4xl">{title}</h2>
    {body && <p className="mt-3 text-base font-semibold leading-7 text-stone-600">{body}</p>}
  </div>
);

const FoodCard = ({ title, vendor = "Jollof Kingdom", price = "£8.99", rating = "4.7", tag = "Bestseller", variant = 0 }) => (
  <div className="overflow-hidden rounded-3xl border border-stone-100 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl hover:shadow-green-900/5">
    <FoodImage label="" className="h-40 rounded-none" variant={variant}/>
    <div className="p-4">
      <div className="mb-2 flex items-center justify-between"><Badge tone={tag === "Bestseller" ? "gold" : "green"}>{tag}</Badge><span className="flex items-center gap-1 text-xs font-black text-[#00843D]"><Star size={14} className="fill-[#F6B400] text-[#F6B400]"/>{rating}</span></div>
      <h3 className="text-base font-black text-black">{title}</h3>
      <p className="mt-1 text-xs font-bold text-stone-500">{vendor} · Nigerian · West African</p>
      <div className="mt-3 flex items-center justify-between"><span className="text-sm font-bold text-stone-500">25–35 min</span><span className="font-black text-black">{price}</span></div>
    </div>
  </div>
);

const ResultCard = ({ title, cuisine, offer, variant = 0 }) => (
  <div className="grid grid-cols-[130px_1fr_auto] gap-4 rounded-3xl border border-stone-100 bg-white p-3 shadow-sm">
    <FoodImage label="" className="h-32 rounded-2xl" variant={variant}/>
    <div className="py-1">
      <div className="flex items-center gap-2"><h3 className="font-black text-black">{title}</h3><BadgeCheck size={16} className="text-[#00843D]"/></div>
      <p className="mt-1 text-xs font-bold text-stone-500">{cuisine}</p>
      <p className="mt-2 flex items-center gap-1 text-xs font-black text-stone-700"><Star size={14} className="fill-[#F6B400] text-[#F6B400]"/> 4.7 (1.3k+) · ££</p>
      <p className="mt-1 text-xs font-bold text-stone-500">25–35 min · £2.49 delivery</p>
      <div className="mt-3 flex gap-2"><Badge tone="grey">Jollof</Badge><Badge tone="grey">Grilled</Badge><Badge tone="grey">Spicy</Badge></div>
    </div>
    <div className="flex flex-col items-end justify-between"><p className="text-xs font-black text-[#E30613]">{offer}</p><button className="grid h-9 w-9 place-items-center rounded-xl bg-[#00843D] text-xl font-black text-white">+</button></div>
  </div>
);

const FooterBenefits = () => (
  <div className="mt-8 grid gap-3 border-t border-stone-100 pt-5 md:grid-cols-4">
    {[[Store,"Local flavours","Support local kitchens"],[WalletCards,"Great value","Fair prices, every time"],[Heart,"Made with care","Real food, real people"],[HelpCircle,"Always here","24/7 support"]].map(([Icon,title,body]) => <div key={title} className="flex items-center gap-2 text-xs"><Icon size={18} className="text-[#F6B400]"/><div><p className="font-black text-black">{title}</p><p className="font-bold text-stone-500">{body}</p></div></div>)}
  </div>
);

const FeastPass = () => (
  <div className="mt-8 grid overflow-hidden rounded-3xl shadow-sm md:grid-cols-[1fr_1fr]">
    <div className="bg-[#00843D] p-6 text-white"><Logo compact/><h3 className="mt-3 text-2xl font-black">feastpass</h3><p className="mt-1 text-sm font-bold">Unlimited free delivery and exclusive offers.</p><Button variant="dark" className="mt-4 px-4 py-2">Try FeastPass</Button></div>
    <div className="bg-[#F6B400] p-6 text-black"><Gift size={42} className="text-[#E30613]"/><h3 className="mt-2 text-xl font-black">Refer a friend</h3><p className="text-sm font-bold">Give £5, get £5.</p><Button variant="dark" className="mt-4 px-4 py-2">Invite now</Button></div>
  </div>
);

function Homepage() {
  return <div className="bg-[#FFFDF7]"><Header/><main className="mx-auto max-w-7xl px-4 py-8 md:px-6">
    <section className="grid gap-8 lg:grid-cols-[1fr_0.9fr]">
      <div className="flex flex-col justify-center py-8"><h1 className="text-5xl font-black leading-[1.02] tracking-tight text-black md:text-6xl">The best of <span className="text-[#00843D]">African</span> & <span className="text-[#E30613]">Caribbean</span> food, delivered to you</h1><p className="mt-4 text-lg font-semibold text-stone-600">Bold flavours. Real culture. Party trays, family pots and weekly meals.</p><div className="mt-7 flex max-w-xl rounded-2xl border border-stone-200 bg-white p-2 shadow-sm"><input className="flex-1 bg-transparent px-4 text-sm font-bold outline-none" placeholder="Enter your postcode"/><Button>Find Food</Button></div></div>
      <div className="relative min-h-[430px]"><FoodImage label="Jollof · Jerk · Egusi · Small chops" className="absolute right-0 top-4 h-[390px] w-full rounded-[3rem] shadow-2xl"/><div className="absolute -left-2 top-12 h-80 w-20 rounded-l-full border-l-[20px] border-[#00843D]"/><div className="absolute bottom-10 left-14 h-40 w-56 rounded-b-full border-b-[18px] border-[#F6B400]"/></div>
    </section><TrustStrip/>
    <section className="mt-10"><div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-black">Order for any occasion</h2><a className="text-sm font-black text-[#00843D]">View all</a></div><div className="grid gap-4 md:grid-cols-5">{[[Utensils,"Lunch","Quick & tasty"],[Soup,"Dinner","Hearty & satisfying"],[Star,"Weekend vibes","Treat yourself"],[Users,"Group orders","Feed the crew"],[PartyPopper,"Events & parties","Make it special"]].map(([Icon,t,b],i)=><div key={t} className="rounded-3xl border border-stone-100 bg-white p-5 shadow-sm"><Icon className={i%3===0?'text-[#00843D]':i%3===1?'text-[#E30613]':'text-[#F6B400]'} size={30}/><h3 className="mt-4 font-black">{t}</h3><p className="text-xs font-bold text-stone-500">{b}</p></div>)}</div></section>
    <section className="mt-10"><div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-black">Popular right now</h2><a className="text-sm font-black text-[#00843D]">See all</a></div><div className="grid gap-4 md:grid-cols-4"><FoodCard title="Jollof Kingdom"/><FoodCard title="Island Grill" vendor="Island Grill" rating="4.6" variant={1}/><FoodCard title="Mama K’s Kitchen" vendor="Mama K’s Kitchen" rating="4.8" variant={2}/><FoodCard title="Roti House" vendor="Roti House" rating="4.5" variant={3}/></div></section>
    <section className="mt-10"><div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-black">Featured kitchens</h2><a className="text-sm font-black text-[#00843D]">See all</a></div><div className="grid gap-4 md:grid-cols-3"><FoodCard title="Yardie Flavours" vendor="Jamaican" tag="BBQ" variant={1}/><FoodCard title="Suya Spot" vendor="Nigerian" tag="Halal" variant={2}/><FoodCard title="Carib Cravings" vendor="Trinidadian" tag="Seafood" variant={3}/></div></section><FeastPass/><FooterBenefits/>
  </main></div>;
}

function Browse() {
  return <div className="bg-[#FFFDF7]"><Header/><main className="mx-auto max-w-7xl px-4 py-6 md:px-6"><div className="rounded-3xl border border-stone-100 bg-white p-4 shadow-sm"><div className="flex gap-3"><div className="flex flex-1 items-center gap-3 rounded-2xl bg-stone-50 px-4"><Search size={19} className="text-stone-400"/><input className="w-full bg-transparent py-4 text-sm font-bold outline-none" placeholder="Search for dishes, cuisines or kitchens"/></div><Button>Search</Button></div><div className="mt-4 flex flex-wrap gap-2">{['All Cuisines','Offers','★ 4.0+','Delivery Time','Price','Dietary'].map((x,i)=><Badge key={x} tone={i===0?'green':'white'}>{x}</Badge>)}</div></div><div className="mt-6 grid gap-6 lg:grid-cols-[260px_1fr]"><aside className="rounded-3xl border border-stone-100 bg-white p-5 shadow-sm"><div className="flex justify-between"><h3 className="font-black">Filters</h3><a className="text-xs font-black text-[#00843D]">Clear all</a></div>{[['Cuisines',['All Cuisines','Nigerian','Jamaican','Ghanaian','Trinidadian','Caribbean','West African']],['Dietary',['Vegetarian','Vegan','Halal','Gluten Free']],['Delivery Time',['Up to 20 min','20–35 min','35–50 min','50+ min']],['Rating',['4.5+','4.0+','3.5+','3.0+']]].map(([g,items])=><div key={g} className="mt-6 border-t border-stone-100 pt-5"><p className="mb-3 text-sm font-black">{g}</p><div className="space-y-3">{items.map((it,idx)=><label key={it} className="flex gap-3 text-sm font-bold text-stone-600"><input type="checkbox" defaultChecked={idx===0} className="accent-[#00843D]"/> {it}</label>)}</div></div>)}</aside><section><div className="mb-4 flex justify-between"><h1 className="text-2xl font-black">126 results</h1><p className="text-sm font-bold text-stone-500">Sort by: Relevance</p></div><div className="space-y-4"><ResultCard title="Jollof Kingdom" cuisine="Nigerian · West African" offer="20% off"/><ResultCard title="Island Grill" cuisine="Jamaican · Caribbean" offer="15% off" variant={1}/><ResultCard title="Mama K’s Kitchen" cuisine="Ghanaian · West African" offer="Popular" variant={2}/><ResultCard title="Roti House" cuisine="Trinidadian · Caribbean" offer="" variant={3}/><ResultCard title="Suya Spot" cuisine="Nigerian · West African" offer="10% off" variant={1}/></div><div className="sticky bottom-4 mt-6 flex items-center justify-between rounded-3xl border border-stone-100 bg-white p-4 shadow-xl"><div className="flex items-center gap-3"><ShoppingBasket className="text-[#00843D]"/><div><p className="font-black">View basket</p><p className="text-sm font-bold text-stone-500">2 items · £24.48</p></div></div><Button>Go to Checkout</Button></div></section></div></main></div>;
}

function VendorProfile() {
  const items = [["Party Jollof","Smoky party-style jollof with fried plantain","£8.99"],["Jollof & Chicken","Party jollof rice with grilled chicken","£11.49"],["Suya Platter","Spicy suya beef with onions & cucumber","£10.49"],["Fried Plantain","Sweet fried plantain","£3.49"],["Hibiscus Zobo","Refreshing traditional drink","£2.49"]];
  return <div className="bg-[#FFFDF7]"><Header/><main className="mx-auto max-w-7xl px-4 py-6 md:px-6"><section className="overflow-hidden rounded-[2rem] border border-stone-100 bg-white shadow-sm"><div className="relative h-72"><FoodImage label="" className="h-full rounded-none" variant={0}/><div className="absolute bottom-6 left-6 rounded-3xl bg-white p-5 shadow-xl"><h1 className="text-3xl font-black">Jollof Kingdom <BadgeCheck className="inline text-[#00843D]" size={21}/></h1><p className="mt-1 text-sm font-bold text-stone-500">Nigerian · West African</p><p className="mt-2 text-sm font-black"><Star className="inline fill-[#F6B400] text-[#F6B400]" size={16}/> 4.7 (1.3k+) · ££ · 25–35 min · £2.49 delivery</p></div><Badge tone="red" className="absolute right-6 top-6">20% off orders over £20</Badge></div><div className="grid gap-6 p-6 lg:grid-cols-[1fr_320px]"><div><TrustStrip/><div className="mt-6 flex gap-4 border-b border-stone-100"><button className="border-b-4 border-[#00843D] px-2 pb-4 font-black">Menu</button><button className="px-2 pb-4 font-bold text-stone-500">Reviews (1.3k)</button><button className="px-2 pb-4 font-bold text-stone-500">About</button><button className="px-2 pb-4 font-bold text-stone-500">Info</button></div><div className="mt-5 flex flex-wrap gap-2"><Badge tone="green">Popular</Badge>{['Jollof Dishes','Grilled','Sides','Drinks','Combos'].map(x=><Badge key={x} tone="white">{x}</Badge>)}</div><div className="mt-6 space-y-4">{items.map((it,i)=><div key={it[0]} className="grid grid-cols-[90px_1fr_auto] gap-4 rounded-3xl border border-stone-100 bg-white p-3 shadow-sm"><FoodImage label="" className="h-24 rounded-2xl" variant={i}/><div><h3 className="font-black">{it[0]}</h3><p className="mt-1 text-xs font-bold text-stone-500">{it[1]}</p><p className="mt-3 font-black">{it[2]}</p></div><button className="mt-auto grid h-9 w-9 place-items-center rounded-xl bg-[#00843D] text-xl font-black text-white">+</button></div>)}</div></div><aside className="h-fit rounded-3xl border border-stone-100 bg-white p-5 shadow-lg"><div className="flex justify-between"><h3 className="text-xl font-black">Your Order</h3><a className="text-xs font-black text-[#E30613]">Clear</a></div><div className="mt-5 space-y-3 text-sm font-bold"><div className="flex justify-between"><span>Party Jollof</span><span>£8.99</span></div><div className="flex justify-between"><span>Jollof & Chicken</span><span>£11.49</span></div><div className="flex justify-between"><span>Hibiscus Zobo</span><span>£2.49</span></div></div><div className="mt-5 border-t border-stone-100 pt-4 text-sm font-bold"><div className="flex justify-between"><span>Subtotal</span><span>£22.97</span></div><div className="mt-2 flex justify-between"><span>Delivery Fee</span><span>£2.49</span></div><div className="mt-2 flex justify-between"><span>Service Fee</span><span>£0.99</span></div><div className="mt-4 flex justify-between text-xl font-black"><span>Total</span><span>£26.45</span></div></div><Button className="mt-5 w-full">Go to Checkout</Button><Button variant="gold" className="mt-3 w-full">Checkout with Pay</Button><p className="mt-3 text-center text-xs font-bold text-stone-500"><Lock className="inline" size={13}/> Secure checkout</p></aside></div></section></main></div>;
}

function DishDetail() {
  return <div className="bg-[#FFFDF7]"><Header/><main className="mx-auto max-w-4xl px-4 py-8 md:px-6"><div className="overflow-hidden rounded-[2rem] border border-stone-100 bg-white shadow-lg"><FoodImage label="" className="h-80 rounded-none"/><div className="p-6"><Badge tone="red" className="float-right">20% off · Save £2.40</Badge><h1 className="text-3xl font-black">Jollof Kingdom <BadgeCheck className="inline text-[#00843D]" size={21}/></h1><p className="mt-1 font-bold text-stone-500">Nigerian · West African</p><p className="mt-3 text-sm font-black"><Star className="inline fill-[#F6B400] text-[#F6B400]" size={16}/> 4.7 (1.3k+) · ££ · 🌶️ Spicy · 25–35 min · £2.49 delivery</p><p className="mt-4 font-semibold text-stone-600">Smoky party-style Jollof rice with fried plantain and your choice of protein.</p><div className="mt-7 flex justify-between"><h2 className="font-black">Choose your protein</h2><span className="text-xs font-black text-[#E30613]">Required</span></div><div className="mt-3 grid gap-3 md:grid-cols-4">{['Jollof Only £8.99','Jollof & Chicken £11.49','Jollof & Beef £12.49','Jollof & Goat £13.49'].map((x,i)=><div key={x} className={`rounded-2xl border p-4 text-sm font-black ${i===0?'border-[#00843D] bg-green-50':'border-stone-200 bg-white'}`}>{x}{i===0&&<CheckCircle2 className="mt-3 text-[#00843D]" size={18}/>}</div>)}</div><div className="mt-5 grid gap-3 md:grid-cols-3"><Badge tone="red"><AlertTriangle size={15}/> Allergens · Gluten, Celery</Badge><Badge tone="green"><ShieldCheck size={15}/> Halal certified</Badge><Badge tone="white"><CheckCircle2 size={15}/> Dairy free option</Badge></div><h2 className="mt-7 font-black">Add-ons</h2><div className="mt-3 space-y-3">{['Fried Plantain £2.49','Moi Moi £2.49','Extra Jollof Rice £2.99','Suya Spiced Beef £4.49'].map((x,i)=><div key={x} className="flex items-center justify-between rounded-2xl bg-stone-50 p-3"><div className="flex items-center gap-3"><FoodImage label="" className="h-14 w-14 rounded-xl" variant={i}/><p className="font-black">{x}</p></div><button className="grid h-8 w-8 place-items-center rounded-lg bg-[#00843D] text-white">+</button></div>)}</div><div className="mt-6 flex items-center justify-between"><div className="flex items-center gap-4"><Button variant="secondary">−</Button><span className="font-black">1</span><Button variant="secondary">+</Button></div><Button className="px-12">Add to basket · £8.99</Button></div></div></div></main></div>;
}

function Checkout() {
  const rows = [['Delivery Address','10 Palmers Green, London · SW14 1AA','Change'],['Delivery Slot','Today, 7 May · 18:00–19:00 · £2.49','Change'],['Contact Details','07960 123456 · alex.martin@email.com','Change'],['Allergy Notes','Please avoid nuts and seeds. I’m allergic to peanuts.','Add'],['Payment','Visa ending in 4242','Change']];
  return <div className="bg-[#FFFDF7]"><Header/><main className="mx-auto grid max-w-6xl gap-6 px-4 py-8 md:px-6 lg:grid-cols-[1fr_360px]"><section><div className="mb-6 flex items-center gap-3"><Badge tone="green">1 Checkout</Badge><Badge tone="grey">2 Payment</Badge><Badge tone="grey">3 Confirmation</Badge></div><div className="space-y-4">{rows.map(([t,b,a],i)=><div key={t} className="rounded-3xl border border-stone-100 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><h2 className="font-black">{t}</h2><a className="text-xs font-black text-[#00843D]">{a}</a></div><p className="mt-3 text-sm font-bold text-stone-600">{b}</p></div>)}</div></section><aside className="h-fit rounded-3xl border border-stone-100 bg-white p-5 shadow-lg"><div className="flex justify-between"><h2 className="text-xl font-black">Order Summary</h2><a className="text-xs font-black text-[#00843D]">Edit Basket</a></div><div className="mt-5 flex items-center gap-3"><FoodImage label="" className="h-16 w-16 rounded-xl"/><div className="flex-1"><p className="font-black">Jollof Kingdom</p><p className="text-xs font-bold text-stone-500">Jollof & Chicken</p></div><p className="font-black">£11.49</p></div><div className="mt-5 border-t border-stone-100 pt-4 text-sm font-bold"><div className="flex justify-between"><span>Subtotal</span><span>£11.49</span></div><div className="mt-2 flex justify-between"><span>Delivery Fee</span><span>£2.49</span></div><div className="mt-2 flex justify-between"><span>Service Fee</span><span>£0.99</span></div><div className="mt-4 flex justify-between text-xl font-black"><span>Total</span><span>£14.97</span></div></div><p className="mt-5 text-xs font-semibold text-stone-500">By placing this order you agree to our Terms & Conditions and Privacy Policy.</p><Button className="mt-5 w-full"><Lock size={16} className="mr-2"/> Confirm Order · £14.97</Button><p className="mt-3 text-center text-xs font-bold text-stone-500">Secure checkout</p></aside></main></div>;
}

function OrderTracking() {
  return <div className="bg-[#FFFDF7]"><Header/><main className="mx-auto max-w-5xl px-4 py-8 md:px-6"><div className="rounded-[2rem] border border-stone-100 bg-white p-6 shadow-lg"><div className="rounded-3xl bg-[#005C2B] p-7 text-white"><div className="grid gap-6 md:grid-cols-[1fr_auto]"><div><p className="font-bold">Estimated delivery</p><h1 className="mt-1 text-4xl font-black">18:40 – 18:55</h1><p className="font-bold">Today, 7 May</p></div><Logo compact/></div></div><div className="mt-6 grid gap-3 md:grid-cols-5">{['Placed 18:00','Accepted 18:02','Cooking 18:12','Out for delivery','Delivered'].map((x,i)=><div key={x} className={`rounded-2xl p-4 text-center text-xs font-black ${i<3?'bg-green-50 text-[#00843D]':i===2?'bg-yellow-50 text-yellow-800':'bg-stone-50 text-stone-400'}`}><CheckCircle2 className="mx-auto mb-2" size={20}/>{x}</div>)}</div><div className="mt-6 rounded-3xl bg-stone-50 p-5"><h2 className="text-xl font-black">Your order is being cooked</h2><p className="mt-2 font-semibold text-stone-600">The restaurant is preparing your delicious meal with fresh ingredients.</p></div><div className="mt-6 grid gap-6 md:grid-cols-[1fr_300px]"><div><h2 className="font-black">Order Updates</h2><div className="mt-4 space-y-5">{[['Cooking started','18:12'],['Order accepted','18:02'],['Order placed','18:00']].map(([t,time],i)=><div key={t} className="flex gap-3"><span className={`mt-1 h-4 w-4 rounded-full ${i===0?'bg-[#00843D]':'border border-stone-300 bg-white'}`}/><div><p className="font-black">{t}<span className="ml-3 text-xs text-stone-400">{time}</span></p><p className="text-sm font-semibold text-stone-600">We’ve received your update. Sit tight, we’re on it.</p></div></div>)}</div></div><aside className="rounded-3xl border border-stone-100 bg-white p-4"><FoodImage label="" className="h-20 rounded-2xl"/><h3 className="mt-3 font-black">Loved your meal?</h3><p className="text-sm font-bold text-stone-500">Reorder or save as favourite.</p><Button className="mt-4 w-full">Reorder</Button><Button variant="secondary" className="mt-3 w-full">Save as favourite</Button></aside></div><FooterBenefits/></div></main></div>;
}

function Account() {
  return <div className="bg-[#FFFDF7]"><Header/><main className="mx-auto max-w-6xl px-4 py-8 md:px-6"><div className="grid gap-6 lg:grid-cols-[360px_1fr]"><aside className="rounded-3xl border border-stone-100 bg-white p-6 shadow-sm"><div className="flex items-center gap-4"><div className="grid h-20 w-20 place-items-center rounded-full bg-[#F6B400] text-2xl font-black">TO</div><div><h1 className="text-2xl font-black">Hi Alex! 👋</h1><p className="text-sm font-bold text-stone-500">alex.martin@email.com</p><a className="text-sm font-black text-[#00843D]">Edit profile</a></div></div><div className="mt-6 rounded-3xl bg-[#00843D] p-5 text-white"><h2 className="text-2xl font-black"><span className="text-[#F6B400]">feast</span>points</h2><p className="mt-4 text-4xl font-black">1,250</p><p className="font-bold">Points balance · Gold Member</p></div></aside><section className="space-y-5"><div className="grid gap-4 md:grid-cols-3">{[['Earn Points','With every order',Star],['Exclusive Offers','Members only',Gift],['Birthday Treats','Something special',PartyPopper]].map(([t,b,Icon])=><div key={t} className="rounded-3xl border border-stone-100 bg-white p-5 text-center shadow-sm"><Icon className="mx-auto text-[#F6B400]"/><h3 className="mt-3 font-black">{t}</h3><p className="text-xs font-bold text-stone-500">{b}</p></div>)}</div><div className="rounded-3xl border border-stone-100 bg-white p-5 shadow-sm"><div className="flex justify-between"><h2 className="font-black">Saved Addresses</h2><a className="text-xs font-black text-[#00843D]">Manage</a></div><div className="mt-4 space-y-3"><div className="rounded-2xl border border-[#00843D] bg-green-50 p-4 font-bold">✓ 10 Palmers Green, London · SW14 1AA</div><div className="rounded-2xl bg-stone-50 p-4 font-bold text-stone-600">Flat 4, 12 Thackeray Road · SW15 2XH</div></div></div><div className="rounded-3xl border border-stone-100 bg-white p-5 shadow-sm"><h2 className="font-black">Allergen Profile</h2><div className="mt-4 grid gap-3 md:grid-cols-4">{['Peanuts · Allergic','Nuts · Allergic','Gluten · Avoid','Shellfish · Avoid'].map((x,i)=><Badge key={x} tone={i<2?'red':'gold'}>{x}</Badge>)}</div></div><div className="rounded-3xl bg-[#00843D] p-6 text-white"><h2 className="text-3xl font-black">Give £5, Get £5 🎉</h2><p className="mt-2 font-bold">Invite friends, they get £5 off and you get £5 FeastPoints.</p><div className="mt-4 flex gap-3 rounded-2xl bg-white p-2"><input className="flex-1 px-3 font-black text-black outline-none" value="FEASTALEX5" readOnly/><Button variant="secondary">Copy</Button><Button variant="gold">Invite Now</Button></div></div></section></div></main></div>;
}

function TrustSafety() {
  return <div className="bg-[#FFFDF7]"><Header/><main className="mx-auto max-w-7xl px-4 py-8 md:px-6"><section className="grid gap-8 lg:grid-cols-[0.9fr_1fr]"><div><h1 className="text-5xl font-black leading-tight">Your trust, <span className="text-[#00843D]">our promise</span></h1><p className="mt-4 font-semibold leading-7 text-stone-600">We’re committed to safe food, secure payments and a great experience every time.</p></div><FoodImage label="Verified kitchens and real reviews" className="h-72" variant={1}/></section><div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-4">{[[ShieldCheck,'Verified Kitchens','Every kitchen is checked before joining.','green'],[BadgeCheck,'FSA Registered','Partners provide food registration details.','gold'],[AlertTriangle,'Allergen Information','Clear allergen labels on every dish.','red'],[Lock,'Secure Payments','Encrypted payments and protected checkout.','green']].map(([Icon,t,b,tone])=><div key={t} className="rounded-3xl border border-stone-100 bg-white p-6 shadow-sm"><Icon size={38} className={tone==='green'?'text-[#00843D]':tone==='gold'?'text-[#F6B400]':'text-[#E30613]'}/><h2 className="mt-5 text-xl font-black">{t}</h2><p className="mt-2 text-sm font-semibold text-stone-600">{b}</p><Badge tone={tone} className="mt-4">Compliant</Badge></div>)}</div><section className="mt-8 grid gap-6 lg:grid-cols-[1fr_0.8fr]"><div className="rounded-3xl border border-stone-100 bg-white p-6 shadow-sm"><h2 className="text-xl font-black">Real reviews from real customers</h2><p className="mt-2 font-black"><Star className="inline fill-[#F6B400] text-[#F6B400]"/> 4.7 out of 5 · 3,134 reviews</p><div className="mt-5 grid gap-3 md:grid-cols-3">{['Amaka O. · Jollof was amazing and hot.','David K. · Great portions and super tasty.','Sophie L. · Loved the goat stew.'].map(x=><div key={x} className="rounded-2xl bg-stone-50 p-4 text-sm font-bold text-stone-600">{x}</div>)}</div></div><div className="rounded-3xl border border-stone-100 bg-white p-6 shadow-sm"><h2 className="text-xl font-black">Support & disputes</h2><div className="mt-4 space-y-3 font-bold text-stone-600"><p>✓ Live chat and quick responses</p><p>✓ Easy refunds and order issue resolution</p><p>✓ Dedicated support every step of the way</p></div></div></section><FooterBenefits/></main></div>;
}

function VendorOnboarding() {
  return <div className="bg-[#FFFDF7]"><Header/><main className="mx-auto grid max-w-7xl gap-8 px-4 py-8 md:px-6 lg:grid-cols-[0.9fr_1.1fr]"><section><h1 className="text-5xl font-black leading-tight">Join FeastPot and grow your business</h1><p className="mt-4 font-semibold leading-7 text-stone-600">Join hundreds of verified kitchens earning more with zero commission on launch orders.</p><FoodImage label="Founding kitchen programme" className="mt-6 h-72" variant={1}/><div className="mt-6 grid gap-4 md:grid-cols-4">{[[Store,'More orders'],[WalletCards,'Zero commission'],[CalendarDays,'Weekly payouts'],[MessageCircle,'Marketing support']].map(([Icon,t])=><div key={t} className="rounded-3xl bg-white p-4 text-center shadow-sm"><Icon className="mx-auto text-[#00843D]"/><p className="mt-3 text-sm font-black">{t}</p></div>)}</div><div className="mt-6 rounded-3xl bg-yellow-50 p-5 font-bold text-yellow-900">Get paid every week — reliable weekly payouts straight to your bank account.</div></section><section className="rounded-3xl border border-stone-100 bg-white p-6 shadow-sm"><h2 className="text-2xl font-black">Apply to become a partner</h2><div className="mt-5 rounded-2xl bg-green-50 p-4"><h3 className="font-black">Requirements</h3><div className="mt-3 space-y-2 text-sm font-bold text-stone-600"><p>✓ FSA registration</p><p>✓ Food hygiene rating</p><p>✓ Quality and consistency</p><p>✓ Valid documents</p></div></div><div className="mt-5 grid gap-4 md:grid-cols-2">{['Full Name','Kitchen / Business Name','Email Address','Phone Number','Kitchen Address','FSA Registration Number'].map(x=><label key={x}><span className="mb-2 block text-sm font-black">{x}</span><div className="rounded-2xl bg-stone-50 px-4 py-4 text-sm font-bold text-stone-400">Enter {x.toLowerCase()}</div></label>)}</div><label className="mt-4 block"><span className="mb-2 block text-sm font-black">Tell us about your kitchen</span><div className="h-28 rounded-2xl bg-stone-50 p-4 text-sm font-bold text-stone-400">Share your story, specialities and what makes your food special...</div></label><Button className="mt-6 w-full">Submit Application</Button></section></main></div>;
}

function EventCatering() {
  return <div className="bg-[#FFFDF7]"><Header/><main className="mx-auto grid max-w-7xl gap-8 px-4 py-8 md:px-6 lg:grid-cols-[0.85fr_1.15fr]"><section><h1 className="text-5xl font-black leading-tight">Catering for every occasion</h1><p className="mt-4 font-semibold leading-7 text-stone-600">Delicious African & Caribbean food. Delivered. Stress-free.</p><FoodImage label="Weddings · birthdays · corporate · parties" className="mt-6 h-72"/><div className="mt-6 grid grid-cols-3 gap-3">{[[Heart,'Weddings'],[Baby,'Birthdays'],[BriefcaseBusiness,'Corporate'],[PartyPopper,'Parties'],[Church,'Funerals'],[MessageCircle,'Other']].map(([Icon,t])=><div key={t} className="rounded-2xl bg-white p-4 text-center shadow-sm"><Icon className="mx-auto text-[#E30613]"/><p className="mt-2 text-sm font-black">{t}</p></div>)}</div></section><section className="rounded-3xl border border-stone-100 bg-white p-6 shadow-sm"><h2 className="text-2xl font-black">Tell us about your event</h2><div className="mt-5 space-y-5"><div><p className="mb-2 text-sm font-black">Number of guests</p><div className="flex w-60 items-center justify-between rounded-2xl bg-stone-50 p-3"><Button variant="secondary">−</Button><span className="font-black">25 guests</span><Button variant="secondary">+</Button></div></div><div><p className="mb-2 text-sm font-black">Cuisine preference</p><div className="flex flex-wrap gap-2">{['Nigerian','Jollof Dishes','Grills','Caribbean','Sides','Drinks'].map((x,i)=><Badge key={x} tone={i===1?'green':'white'}>{x}</Badge>)}</div></div><div><p className="mb-2 text-sm font-black">Budget range</p><div className="flex gap-2">{['£5–£10','£10–£15','£15–£20','£20+'].map((x,i)=><Badge key={x} tone={i===1?'green':'white'}>{x}</Badge>)}</div></div>{['Your postcode','Event date','Event type','Additional notes'].map(x=><div key={x} className="rounded-2xl bg-stone-50 p-4 text-sm font-bold text-stone-400">{x}</div>)}</div><div className="mt-6 rounded-3xl border border-yellow-100 bg-yellow-50 p-5"><h3 className="font-black">Why choose FeastPot Catering?</h3><div className="mt-4 grid gap-3 md:grid-cols-4">{['Custom menus','Verified kitchens','On-time delivery','Dedicated support'].map(x=><div key={x} className="text-center text-xs font-bold text-stone-700">✓ {x}</div>)}</div></div><Button className="mt-6 w-full">Get Catering Options</Button></section></main></div>;
}

function EmptyStates() {
  const states = [[MapPin,'We don’t deliver here yet','We’re working hard to bring FeastPot to your area.','Check again','green'],[ShoppingBasket,'No orders yet','When you place an order, it’ll appear here.','Browse restaurants','gold'],[Store,'Vendor is closed','This kitchen is currently closed. Opening hours: 10:00–22:00.','Browse other kitchens','red'],[Soup,'Dish unavailable','Sorry, this dish is currently unavailable.','View similar dishes','grey']];
  return <div className="bg-[#FFFDF7]"><Header/><main className="mx-auto max-w-6xl px-4 py-8 md:px-6"><SectionHeader eyebrow="States & polish" title="Empty, loading and unavailable states" body="These prevent the product from feeling broken and give users the next best action."/><div className="grid gap-5 md:grid-cols-2">{states.map(([Icon,t,b,cta,tone])=><div key={t} className="rounded-3xl border border-stone-100 bg-white p-8 text-center shadow-sm"><Icon className={`mx-auto ${tone==='green'?'text-[#00843D]':tone==='gold'?'text-[#F6B400]':tone==='red'?'text-[#E30613]':'text-purple-500'}`} size={58}/><h2 className="mt-5 text-xl font-black">{t}</h2><p className="mt-2 font-semibold text-stone-600">{b}</p><Button className="mt-5" variant={tone==='gold'?'gold':tone==='red'?'red':'primary'}>{cta}</Button></div>)}</div><div className="mt-5 rounded-3xl border border-stone-100 bg-white p-6 shadow-sm"><h2 className="font-black">Loading delicious food...</h2><div className="mt-4 grid gap-4 md:grid-cols-4">{[1,2,3,4].map(i=><div key={i} className="space-y-3"><div className="h-32 animate-pulse rounded-2xl bg-stone-100"/><div className="h-4 w-3/4 animate-pulse rounded bg-stone-100"/><div className="h-4 w-1/2 animate-pulse rounded bg-stone-100"/></div>)}</div></div></main></div>;
}

function SEOLanding() {
  return <div className="bg-[#FFFDF7]"><Header/><main className="mx-auto max-w-7xl px-4 py-8 md:px-6"><section className="grid gap-8 lg:grid-cols-[1fr_0.9fr]"><div><p className="text-xs font-black uppercase tracking-widest text-[#00843D]">Nigerian catering in London</p><h1 className="mt-3 text-5xl font-black leading-tight">Authentic <span className="text-[#00843D]">Nigerian</span> catering in London, delivered to you</h1><p className="mt-4 font-semibold leading-7 text-stone-600">Jollof rice, stews, soups and more from trusted Nigerian chefs and caterers across London.</p><div className="mt-6 flex max-w-xl rounded-2xl border border-stone-200 bg-white p-2 shadow-sm"><input className="flex-1 bg-transparent px-4 text-sm font-bold outline-none" placeholder="Enter your postcode"/><Button>Find Food</Button></div></div><FoodImage label="Nigerian catering in London" className="h-80"/></section><TrustStrip/><section className="mt-8"><div className="flex justify-between"><h2 className="text-xl font-black">Popular Nigerian cuisines</h2><a className="text-sm font-black text-[#00843D]">See all cuisines</a></div><div className="mt-4 grid gap-4 md:grid-cols-5">{['Jollof Rice','Soups & Stews','Small Chops','Grilled & Suya','Pounded Yam'].map((x,i)=><FoodCard key={x} title={x} vendor="" variant={i}/>)}</div></section><section className="mt-8"><h2 className="text-xl font-black">Popular areas for Nigerian catering in London</h2><div className="mt-4 grid gap-3 md:grid-cols-6">{['Peckham SE15','Woolwich SE18','Stratford E15','Brixton SW2','Lewisham SE13','Croydon CR0'].map(x=><div key={x} className="rounded-2xl border border-stone-100 bg-white p-4 text-sm font-black shadow-sm"><MapPin className="inline text-[#00843D]" size={16}/> {x}</div>)}</div></section><FeastPass/><FooterBenefits/></main></div>;
}

function MobileApp() {
  const Phone = ({ children }) => <div className="mx-auto h-[720px] w-[340px] overflow-hidden rounded-[3rem] border-[10px] border-black bg-white shadow-2xl"><div className="h-full overflow-auto">{children}</div></div>;
  return <div className="bg-[#FFFDF7] p-6"><div className="grid gap-8 xl:grid-cols-4"><Phone><div className="p-4"><div className="flex items-center justify-between"><Logo/><ShoppingBasket/></div><p className="mt-3 text-sm font-black text-[#00843D]"><MapPin className="inline" size={15}/> London, SW1A 1AA</p><div className="mt-4 flex rounded-2xl bg-stone-50 p-2"><input className="flex-1 bg-transparent px-3 text-sm font-bold outline-none" placeholder="Search dishes..."/><Button className="px-3"><Search size={16}/></Button></div><div className="mt-4 flex gap-2 overflow-x-auto">{['All','Nigerian','Grills','Soups','Small Chops'].map((x,i)=><Badge key={x} tone={i===0?'green':'white'}>{x}</Badge>)}</div><FeastPass/><h2 className="mt-6 text-xl font-black">Popular right now</h2><div className="mt-3 grid grid-cols-2 gap-3"><FoodCard title="Jollof Kingdom"/><FoodCard title="Island Grill" variant={1}/></div><FooterBenefits/></div></Phone><Phone><div className="p-4"><div className="flex gap-2"><input className="flex-1 rounded-2xl bg-stone-50 px-4 text-sm font-bold outline-none" value="Nigerian catering" readOnly/><Button>Search</Button></div><div className="mt-4 flex flex-wrap gap-2">{['All','Nigerian','Offers','★ 4.0+','Filter'].map((x,i)=><Badge key={x} tone={i===1?'green':'white'}>{x}</Badge>)}</div><p className="mt-4 font-black">128 results</p><div className="mt-3 space-y-3"><ResultCard title="Jollof Kingdom" cuisine="Nigerian" offer="20% off"/><ResultCard title="Mama K’s" cuisine="Ghanaian" offer="Popular" variant={1}/><ResultCard title="Suya Spot" cuisine="Nigerian" offer="10% off" variant={2}/></div></div></Phone><Phone><div className="p-4"><h2 className="text-center font-black">Order Tracking</h2><div className="mt-4 rounded-3xl bg-green-50 p-5 text-center"><h1 className="text-xl font-black">Preparing your order</h1><p className="text-sm font-bold text-stone-500">Suya Spot is preparing your order</p></div><div className="mt-5 h-72 rounded-3xl bg-stone-100 p-5"><Navigation className="mx-auto mt-20 text-[#00843D]" size={70}/><p className="mt-5 text-center font-black">12 mins away</p></div><div className="mt-5 rounded-3xl border border-stone-100 p-4"><p className="font-black">Suya Spot</p><p className="text-sm font-bold text-stone-500">Order #FP-78214</p><p className="mt-3 font-black">Total £26.45</p><Button className="mt-4 w-full">View receipt</Button></div></div></Phone><Phone><div className="p-4"><h2 className="text-center font-black">Account</h2><div className="mt-4 flex items-center gap-3"><div className="grid h-16 w-16 place-items-center rounded-full bg-[#F6B400] font-black">TO</div><div><p className="font-black">Tolu Onifade</p><p className="text-xs font-bold text-stone-500">tolu@email.com</p></div></div><div className="mt-5 rounded-3xl bg-[#00843D] p-5 text-white"><p className="font-black">feastpass <Badge tone="gold">Active</Badge></p><p className="mt-2 text-sm font-bold">Renews on 24 May 2025</p></div><div className="mt-5 space-y-3">{['My Orders','Addresses','Payment Methods','Favourites','Help & Support','Invite a Friend'].map(x=><div key={x} className="rounded-2xl bg-stone-50 p-4 font-black">{x}</div>)}</div><div className="mt-5 rounded-3xl bg-yellow-50 p-5"><h2 className="text-xl font-black">Give £5, Get £5</h2><p className="text-sm font-bold text-stone-600">Share your code.</p><Button variant="red" className="mt-4 w-full">Share Invite</Button></div></div></Phone></div></div>;
}

const Board = ({ title, children }) => <div className="min-h-screen bg-[#FFF8E8] p-4 md:p-6"><PanelTitle num="" title={title}/><div className="overflow-hidden rounded-[2rem] bg-white shadow-2xl shadow-black/10">{children}</div></div>;

export default function FeastPotWireframe() {
  const [tab, setTab] = useState('home');
  const tabs = [
    ['home','Homepage'],['browse','Browse/search results'],['vendor','Vendor profile'],['dish','Dish detail modal'],['checkout','Checkout'],['tracking','Order tracking'],['account','Account / loyalty / referrals'],['trust','Trust & Safety'],['vendorOnboarding','Vendor onboarding'],['event','Event catering'],['states','Empty/loading/unavailable states'],['seo','SEO/location landing page'],['mobile','Mobile app-style layout'],
  ];
  const views = { home:<Homepage/>, browse:<Browse/>, vendor:<VendorProfile/>, dish:<DishDetail/>, checkout:<Checkout/>, tracking:<OrderTracking/>, account:<Account/>, trust:<TrustSafety/>, vendorOnboarding:<VendorOnboarding/>, event:<EventCatering/>, states:<EmptyStates/>, seo:<SEOLanding/>, mobile:<MobileApp/> };
  return <div className="min-h-screen bg-black p-4 md:p-6"><div className="mx-auto mb-4 flex max-w-7xl flex-wrap gap-2 rounded-3xl bg-white/10 p-2 backdrop-blur">{tabs.map(([id,label],idx)=><button key={id} onClick={()=>setTab(id)} className={`rounded-2xl px-4 py-3 text-sm font-black transition ${tab===id?'bg-white text-black':'text-white hover:bg-white/10'}`}><span className="mr-2 text-[#F6B400]">{idx+1}</span>{label}</button>)}</div><div className="mx-auto max-w-7xl overflow-hidden rounded-[2rem] bg-[#FFFDF7] shadow-2xl">{views[tab]}</div></div>;
}
