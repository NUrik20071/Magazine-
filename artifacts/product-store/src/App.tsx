import { Fragment, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, useAuth, useClerk, useUser } from '@clerk/react';
import { setAuthTokenGetter } from '@workspace/api-client-react';
import { ruRU } from '@clerk/localizations';
import {
  getGetAdminOverviewQueryKey,
  getGetStoreSummaryQueryKey,
  getListAdminProductsQueryKey,
  getListProductsQueryKey,
  useCreateProduct,
  useDeleteProduct,
  useGetAdminOverview,
  useGetStoreSummary,
  useListAdminProducts,
  useListProducts,
  useUpdateProduct,
} from '@workspace/api-client-react';
import type { Product } from '@workspace/api-client-react';
import {
  ArrowDownRight, ArrowRight, Leaf, LogOut, Minus, Package, Pencil,
  Plus, Search, ShoppingBag, Trash2, UserRound, X, ClipboardList, Check, Ban, Settings, ExternalLink, ChevronUp, ChevronDown,
} from 'lucide-react';
import { Link, Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import './index.css';

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY?.trim();
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
if (!clerkPubKey) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');

function stripBase(path: string) {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
}

const clerkAppearance = {
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: '#244c43',
    colorForeground: '#244c43',
    colorMutedForeground: '#718077',
    colorDanger: '#a3483d',
    colorBackground: '#faf7f0',
    colorInput: '#fffdf7',
    colorInputForeground: '#244c43',
    colorNeutral: '#d8d0c2',
    fontFamily: 'DM Sans, sans-serif',
    borderRadius: '2px',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#faf7f0] rounded-none w-[440px] max-w-full overflow-hidden',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#244c43] font-serif',
    headerSubtitle: 'text-[#718077]',
    socialButtonsBlockButtonText: 'text-[#244c43]',
    formFieldLabel: 'text-[#52685e]',
    footerActionLink: 'text-[#244c43]',
    footerActionText: 'text-[#718077]',
    dividerText: 'text-[#718077]',
    identityPreviewEditButton: 'text-[#244c43]',
    formFieldSuccessText: 'text-[#486d53]',
    alertText: 'text-[#813d34]',
    logoBox: 'rounded-none',
    logoImage: 'h-8',
    formButtonPrimary: 'bg-[#244c43] !text-white hover:bg-[#356257] shadow-none',
    formFieldInput: 'border-[#d8d0c2] bg-[#fffdf7] text-[#244c43]',
    footerAction: 'bg-transparent',
    dividerLine: 'bg-[#ded7ca]',
    alert: 'bg-[#f4e7df] border-[#e7c7ba]',
    otpCodeFieldInput: 'border-[#d8d0c2] bg-[#fffdf7]',
    formFieldRow: 'text-[#52685e]',
    main: 'text-[#244c43]',
  },
};

type CartItem = { product: Product; quantity: number };

function restoreCart(raw: string | null): CartItem[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is CartItem => {
      if (!item || typeof item !== "object") return false;
      const candidate = item as Partial<CartItem>;
      const product = candidate.product;
      if (!product || typeof product !== "object") return false;
      return Number.isSafeInteger(product.id) && product.id > 0 &&
        typeof product.name === "string" && product.name.trim().length > 0 &&
        typeof product.slug === "string" &&
        typeof product.category === "string" &&
        typeof product.description === "string" &&
        Number.isSafeInteger(product.price) && product.price >= 0 &&
        typeof product.imageUrl === "string" &&
        (typeof product.badge === "string" || product.badge === null) &&
        typeof product.isFeatured === "boolean" &&
        typeof product.isActive === "boolean" &&
        Number.isSafeInteger(candidate.quantity) &&
        candidate.quantity! >= 1 && candidate.quantity! <= 99;
    });
  } catch {
    return [];
  }
}

const photoChoices = [
  '/images/orbit-vase.png',
  '/images/linen-lamp.png',
  '/images/terracotta-tray.png',
];
const productImage = (product: Product, index: number) =>
  product.imageUrl?.trim() || photoChoices[index % photoChoices.length];
const money = (value: number) => `${new Intl.NumberFormat('ru-RU').format(value)} ₸`;

function AdminHeaderLink() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [tokenReady, setTokenReady] = useState(false);
  useEffect(() => {
    if (!isLoaded) return;
    setAuthTokenGetter(() => getToken());
    setTokenReady(true);
    return () => setAuthTokenGetter(null);
  }, [getToken, isLoaded]);
  const overview = useGetAdminOverview({
    query: {
      queryKey: getGetAdminOverviewQueryKey(),
      enabled: isLoaded && isSignedIn === true && tokenReady,
      retry: false,
      staleTime: 30_000,
    },
  });
  if (!overview.data) return null;
  return <Link className="quiet-link" href="/admin" data-testid="link-admin-panel">Панель управления</Link>;
}

function ShopHeader({ count, onCart, announcement }: { count: number; onCart: () => void; announcement: string }) {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const { signOut } = useClerk();
  const [signingOut, setSigningOut] = useState(false);
  const displayName = user?.fullName || user?.firstName || user?.primaryEmailAddress?.emailAddress || 'Мой аккаунт';

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut({ redirectUrl: `${basePath}/` || '/' });
    } finally {
      setSigningOut(false);
    }
  }

  return <>
    <div className="announcement">{announcement}</div>
    <header className="header">
      <Link href="/" className="brand" data-testid="link-home">тихо.<small>дом и повседневность</small></Link>
      <nav className="header-links" aria-label="Главная навигация">
        <a className="quiet-link" href="#catalog">Каталог</a>
        <a className="quiet-link" href="#about">О нас</a>
        <AdminHeaderLink />
        {!isLoaded ? <span className="account-loading" role="status">Проверяем аккаунт…</span> : isSignedIn && user ? <>
          <div className="account-profile" data-testid="account-profile" title={user.primaryEmailAddress?.emailAddress || displayName}>
            {user.imageUrl ? <img className="account-avatar" src={user.imageUrl} alt="" /> : <span className="account-avatar-fallback"><UserRound size={16} /></span>}
            <span className="account-profile-text"><strong>{displayName}</strong><small>{user.primaryEmailAddress?.emailAddress || 'Вы вошли в аккаунт'}</small></span>
          </div>
          <button className="account-logout" onClick={() => void handleSignOut()} disabled={signingOut} data-testid="button-sign-out">
            <LogOut size={15} /><span>{signingOut ? 'Выходим…' : 'Выйти'}</span>
          </button>
        </> : <Link className="quiet-link" href="/sign-in" data-testid="link-sign-in">Войти</Link>}
        <button className="icon-button" onClick={onCart} data-testid="button-open-cart" aria-label="Открыть корзину">
          <ShoppingBag size={18} strokeWidth={1.5} /><span>Корзина</span><span className="cart-count" data-testid="text-cart-count">{count}</span>
        </button>
      </nav>
    </header>
  </>;
}

function ProductCard({ product, index, onAdd, onOpen }: { product: Product; index: number; onAdd: (product: Product) => void; onOpen: (product: Product) => void }) {
  return <article className="product-card" data-testid={`card-product-${product.id}`} onClick={() => onOpen(product)} tabIndex={0} role="button" onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpen(product); } }} aria-label={`Открыть товар ${product.name}`}>
    <div className="product-photo">
      <img src={productImage(product, index)} alt={product.name} loading="lazy" data-testid={`img-product-${product.id}`} />
      {product.badge && <span className="badge">{product.badge}</span>}
      <button className="quick-add" onClick={(event) => { event.stopPropagation(); onAdd(product); }} aria-label={`Добавить ${product.name}`} data-testid={`button-add-product-${product.id}`}>
        <Plus size={20} />
      </button>
    </div>
    <div className="product-meta">
      <div><h3 className="product-title">{product.name}</h3><div className="product-category">{product.category}</div></div>
      <div className="product-price">{money(product.price)}</div>
    </div>
    <p className="product-desc">{product.description}</p>
  </article>;
}

function CartDrawer({ items, onClose, onQty, onRemove, onOrderSubmitted }: {
  items: CartItem[];
  onClose: () => void;
  onQty: (id: number, delta: number) => void;
  onRemove: (id: number) => void;
  onOrderSubmitted: () => void;
}) {
  const total = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const [checkout, setCheckout] = useState(false);
  const [sending, setSending] = useState(false);
  const [orderError, setOrderError] = useState('');
  const [orderSuccess, setOrderSuccess] = useState('');
  const [details, setDetails] = useState({ customerName: '', phone: '', email: '', address: '', note: '' });
  async function submitOrder(event: FormEvent) {
    event.preventDefault(); setSending(true); setOrderError('');
    try {
      const response = await fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...details, items: items.map(({ product, quantity }) => ({ productId: product.id, quantity })) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Не удалось отправить заказ');
      setOrderSuccess('Заявка №' + result.id + ' отправлена. Мы проверим заказ и свяжемся с вами.');
      onOrderSubmitted(); setCheckout(false);
    } catch (error) { setOrderError(error instanceof Error ? error.message : 'Ошибка отправки. Попробуйте ещё раз.'); }
    finally { setSending(false); }
  }
  return <div className="drawer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <aside className="cart-drawer" role="dialog" aria-modal="true" aria-label="Корзина">
      <div className="drawer-head"><h2>Ваша корзина</h2><button className="plain-icon" onClick={onClose} aria-label="Закрыть корзину" data-testid="button-close-cart"><X /></button></div>
      {orderSuccess && <div className="order-success" role="status"><Check size={18} />{orderSuccess}</div>}
      {items.length === 0 ? <div className="empty-state" data-testid="empty-cart">Здесь пока тихо.<br /><span style={{ fontSize: 13 }}>Добавьте что-нибудь любимое.</span></div> :
        items.map(({ product, quantity }) => <div className="cart-line" key={product.id} data-testid={`cart-item-${product.id}`}>
          <img src={productImage(product, product.id)} alt={product.name} />
          <div><div className="cart-line-name">{product.name}</div><div className="cart-line-price">{money(product.price)}</div>
            <div className="quantity">
              <button onClick={() => onQty(product.id, -1)} aria-label="Уменьшить количество" data-testid={`button-decrease-${product.id}`}><Minus size={12} /></button>
              <span>{quantity}</span>
              <button onClick={() => onQty(product.id, 1)} aria-label="Увеличить количество" data-testid={`button-increase-${product.id}`}><Plus size={12} /></button>
            </div>
          </div>
          <button className="plain-icon" onClick={() => onRemove(product.id)} aria-label={`Убрать ${product.name}`} data-testid={`button-remove-${product.id}`}><Trash2 size={15} /></button>
        </div>)}
      {items.length > 0 && <>
        <div className="cart-total"><span>Итого</span><strong>{money(total)}</strong></div>
        <p className="checkout-note">Сначала проверим заказ вручную. Оплата — после подтверждения.</p>
        {!checkout ? <button className="primary-button checkout-start" onClick={() => setCheckout(true)}>Оформить заявку <ArrowRight size={15} /></button> : <form className="checkout-form" onSubmit={submitOrder}>
          <h3>Детали заказа</h3>
          <label className="form-field">Ваше имя<input required minLength={2} maxLength={120} value={details.customerName} onChange={e => setDetails({ ...details, customerName: e.target.value })} /></label>
          <label className="form-field">Телефон для связи<input required type="tel" maxLength={40} placeholder="+7 ..." value={details.phone} onChange={e => setDetails({ ...details, phone: e.target.value })} /></label>
          <label className="form-field">Email (необязательно)<input type="email" maxLength={254} value={details.email} onChange={e => setDetails({ ...details, email: e.target.value })} /></label>
          <label className="form-field">Адрес или способ получения<input required minLength={5} maxLength={500} placeholder="Город, адрес или удобный способ связи" value={details.address} onChange={e => setDetails({ ...details, address: e.target.value })} /></label>
          <label className="form-field">Комментарий<textarea maxLength={1000} rows={2} value={details.note} onChange={e => setDetails({ ...details, note: e.target.value })} /></label>
          {orderError && <p className="form-error" role="alert">{orderError}</p>}
          <button className="primary-button checkout-start" disabled={sending}>{sending ? 'Отправляем…' : 'Отправить на модерацию'}</button>
        </form>}
      </>}
    </aside>
  </div>;
}


type StorefrontBlock = { id: string; type: 'text' | 'image' | 'video' | 'audio' | 'button' | 'embed'; title?: string; text?: string; label?: string; url?: string; mediaUrl?: string; background?: string; color?: string; width?: string; animation?: string };
type StorefrontConfig = { theme: { background: string; text: string; accent: string; accentText: string; cardBackground: string; gradient: string; font: string; headingFont: string; cardRadius: number; cardColumns: number; imageRatio: string; animation: string; animationDuration: number; colorAnimation: boolean }; content: { announcement: string; heroEyebrow: string; heroTitle: string; heroText: string; heroImage: string; heroImageLink: string; heroButtonText: string; storyTitle: string; storyText: string }; blocks: StorefrontBlock[] };
const defaultStorefront: StorefrontConfig = {
  theme: { background: '#f5f1e8', text: '#244c43', accent: '#244c43', accentText: '#fffaf1', cardBackground: '#fffdf7', gradient: 'linear-gradient(135deg, #f5f1e8 0%, #e5ded0 100%)', font: 'DM Sans', headingFont: 'Cormorant Garamond', cardRadius: 8, cardColumns: 3, imageRatio: '4 / 5', animation: 'lift', animationDuration: 240, colorAnimation: false },
  content: { announcement: 'Доставка по Казахстану · бесплатно от 35 000 ₸', heroEyebrow: 'Маленькая коллекция для дома', heroTitle: 'Жить\nчуть тише.', heroText: 'Вещи, которые не требуют внимания — только становятся частью хорошего дня. Собираем их небольшими партиями.', heroImage: '/images/orbit-vase.png', heroImageLink: '', heroButtonText: 'Смотреть коллекцию', storyTitle: 'Не больше.\nЛучше.', storyText: '«Тихо» — маленький магазин вещей, которые приятно держать рядом.' },
  blocks: [],
};
function StorefrontBlocks({ blocks }: { blocks: StorefrontBlock[] }) {
  if (!blocks.length) return null;
  return <section className="custom-blocks">{blocks.map((block) => {
    const style: any = { background: block.background || 'transparent', color: block.color || 'inherit', width: block.width || '100%' };
    let content: ReactNode;
    if (block.type === 'text') content = <div className="custom-block-copy"><h2>{block.title}</h2><p>{block.text}</p></div>;
    else if (block.type === 'image') content = <img className="custom-block-media" src={block.mediaUrl} alt={block.title || ''} />;
    else if (block.type === 'video') content = <video className="custom-block-media" src={block.mediaUrl} controls playsInline />;
    else if (block.type === 'audio') content = <audio src={block.mediaUrl} controls />;
    else if (block.type === 'embed') content = <iframe className="custom-block-embed" src={block.mediaUrl} title={block.title || 'Встроенный контент'} loading="lazy" allowFullScreen />;
    else content = <span>{block.label || block.title || 'Открыть'} <ExternalLink size={14} /></span>;
    return <div className={'custom-block custom-block-' + block.type} key={block.id} style={style}>{block.url ? <a href={block.url} target={/^https?:/.test(block.url) ? '_blank' : undefined} rel="noreferrer">{content}</a> : content}</div>;
  })}</section>;
}
function ProductDetailModal({ product, onClose, onAdd }: { product: Product; onClose: () => void; onAdd: (product: Product) => void }) {
  return <div className="product-detail-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="product-detail" role="dialog" aria-modal="true" aria-label={product.name}>
      <button className="product-detail-close" onClick={onClose} aria-label="Закрыть карточку"><X /></button>
      <div className="product-detail-gallery"><div className="product-detail-thumbs"><button className="active"><img src={product.imageUrl || '/images/orbit-vase.png'} alt="" /></button></div><div className="product-detail-main-image"><img src={product.imageUrl || '/images/orbit-vase.png'} alt={product.name} /></div></div>
      <div className="product-detail-info"><span className="eyebrow">{product.category}</span><h1>{product.name}</h1><div className="product-detail-price">{money(product.price)}</div>{product.badge && <span className="badge detail-badge">{product.badge}</span>}<p>{product.description || 'Подробности о товаре уточняйте у продавца.'}</p><div className="product-detail-benefits"><span>✓ Ручной отбор предметов</span><span>✓ Доставка по Казахстану</span><span>✓ Заказ подтверждается вручную</span></div><button className="primary-button product-detail-add" onClick={() => { onAdd(product); onClose(); }}><ShoppingBag size={17} /> Добавить в корзину</button><button className="secondary-button product-detail-back" onClick={onClose}>Вернуться в каталог</button></div>
    </section>
  </div>;
}

function Catalog() {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [storefront, setStorefront] = useState<StorefrontConfig>(defaultStorefront);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [cartOpen, setCartOpen] = useState(false);
  const [cart, setCart] = useState<CartItem[]>(() => {
    try { return restoreCart(localStorage.getItem('tihoshop-cart')); } catch { return []; }
  });
  const listParams = useMemo(() => ({ ...(search.trim() ? { search: search.trim() } : {}), ...(category ? { category } : {}) }), [search, category]);
  const productsQuery = useListProducts(listParams);
  useEffect(() => { fetch('/api/storefront/settings').then((r) => r.ok ? r.json() : null).then((config) => { if (config && config.theme && config.content && Array.isArray(config.blocks)) setStorefront({ ...defaultStorefront, ...config, theme: { ...defaultStorefront.theme, ...config.theme }, content: { ...defaultStorefront.content, ...config.content } }); }).catch(() => undefined); }, []);
  useEffect(() => { const root = document.documentElement; root.style.setProperty('--site-background', storefront.theme.background); root.style.setProperty('--site-text', storefront.theme.text); root.style.setProperty('--site-accent', storefront.theme.accent); root.style.setProperty('--site-accent-text', storefront.theme.accentText); root.style.setProperty('--site-card-background', storefront.theme.cardBackground); root.style.setProperty('--site-gradient', storefront.theme.gradient); root.style.setProperty('--site-font', '"' + storefront.theme.font + '", sans-serif'); root.style.setProperty('--site-heading-font', '"' + storefront.theme.headingFont + '", serif'); root.style.setProperty('--site-card-radius', storefront.theme.cardRadius + 'px'); root.style.setProperty('--site-card-columns', String(storefront.theme.cardColumns)); root.style.setProperty('--site-image-ratio', storefront.theme.imageRatio); root.style.setProperty('--site-animation-duration', storefront.theme.animationDuration + 'ms'); root.dataset.siteAnimation = storefront.theme.animation; root.dataset.colorAnimation = String(storefront.theme.colorAnimation); }, [storefront]);
  const summaryQuery = useGetStoreSummary();
  const products = productsQuery.data ?? [];
  useEffect(() => {
    if (!productsQuery.data) return;
    const latestById = new Map(productsQuery.data.map((product) => [product.id, product]));
    setCart((items) => items.map((item) => {
      const latest = latestById.get(item.product.id);
      return latest ? { ...item, product: latest } : item;
    }));
  }, [productsQuery.data]);
  const categories = summaryQuery.data?.categoryNames ?? Array.from(new Set(products.map((product) => product.category)));
  const featured = summaryQuery.data?.featuredProducts?.[0];
  const count = cart.reduce((sum, item) => sum + item.quantity, 0);
  useEffect(() => {
    try { localStorage.setItem('tihoshop-cart', JSON.stringify(cart)); } catch { /* Storage may be unavailable or full. */ }
  }, [cart]);
  const addProduct = (product: Product) => setCart((items) => {
    const found = items.find((item) => item.product.id === product.id);
    return found
      ? items.map((item) => item.product.id === product.id ? { ...item, product, quantity: Math.min(99, item.quantity + 1) } : item)
      : [...items, { product, quantity: 1 }];
  });
  const changeQty = (id: number, delta: number) => setCart((items) =>
    items.map((item) => item.product.id === id
      ? { ...item, quantity: Math.max(0, Math.min(99, item.quantity + delta)) }
      : item
    ).filter((item) => item.quantity > 0)
  );
  const removeItem = (id: number) => setCart((items) => items.filter((item) => item.product.id !== id));

  return <div className="shop-shell">
    <ShopHeader count={count} onCart={() => setCartOpen(true)} announcement={storefront.content.announcement} />
    <main>
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">{storefront.content.heroEyebrow}</span>
          <h1>{storefront.content.heroTitle.split("\n").map((line, i) => <Fragment key={i}>{i > 0 && <br />}{line}</Fragment>)}</h1>
          <p>{storefront.content.heroText}</p>
          <a className="cta" href="#catalog" data-testid="link-explore-catalog">{storefront.content.heroButtonText} <ArrowDownRight size={16} /></a>
        </div>
        <div className="hero-art">
          <span className="hero-index">ПРЕДМЕТЫ С ХАРАКТЕРОМ · № 01</span>
          <a className="hero-image-link" href={storefront.content.heroImageLink || '#catalog'}><img src={storefront.content.heroImage || featured?.imageUrl || '/images/orbit-vase.png'} alt={featured?.name || 'Керамическая ваза в солнечном свете'} /></a>
          <span className="hero-note">Найдено и выбрано в Казахстане</span>
        </div>
      </section>
      <div className="ticker"><span>С любовью к деталям</span><span>•</span><span>Небольшие тиражи</span><span>•</span><span>Сделано на каждый день</span></div>
      <section className="catalog" id="catalog">
        <div className="section-head">
          <div><span className="eyebrow">Наш выбор</span><h2>Предметы<br />на каждый день</h2></div>
          <div className="catalog-tools">
            <label style={{ position: 'relative' }}><Search size={15} style={{ position: 'absolute', left: 11, top: 11, color: '#829086' }} />
              <input className="search-field" style={{ paddingLeft: 34 }} placeholder="Найти вещь" value={search} onChange={(event) => setSearch(event.target.value)} data-testid="input-product-search" />
            </label>
            <span className="mono" style={{ fontSize: 10, color: '#788176' }}>{products.length.toString().padStart(2, '0')} предмета</span>
          </div>
        </div>
        <div className="filter-row">
          <button className={`filter-chip ${category === '' ? 'active' : ''}`} onClick={() => setCategory('')} data-testid="button-filter-all">Всё</button>
          {categories.map((name) => <button key={name} className={`filter-chip ${category === name ? 'active' : ''}`} onClick={() => setCategory(category === name ? '' : name)} data-testid={`button-filter-${name}`}>{name}</button>)}
        </div>
        {productsQuery.isLoading ? <div className="product-grid" aria-label="Загрузка товаров">{[1, 2, 3, 4].map((n) => <div className="skeleton" key={n} style={{ aspectRatio: '.83' }} />)}</div> :
          productsQuery.isError ? <div className="error-state"><h3 className="serif">Не удалось загрузить коллекцию</h3><p>Проверьте соединение и попробуйте ещё раз.</p><button className="primary-button" onClick={() => productsQuery.refetch()} data-testid="button-retry-products">Повторить</button></div> :
            products.length ? <div className="product-grid">{products.map((product, index) => <ProductCard key={product.id} product={product} index={index} onAdd={addProduct} onOpen={setSelectedProduct} />)}</div> :
              <div className="empty-state" data-testid="empty-products">Коллекция пока собирается.<br /><span style={{ fontSize: 13 }}>Загляните чуть позже — здесь появятся новые находки.</span></div>}
      </section>
      <StorefrontBlocks blocks={storefront.blocks} />
      <section className="story-band" id="about">
        <div className="story-inner">
          <div><span className="eyebrow">Небольшое объяснение</span><h2>{storefront.content.storyTitle.split("\n").map((line, i) => <Fragment key={i}>{i > 0 && <br />}{line}</Fragment>)}</h2><p>{storefront.content.storyText}</p><a className="quiet-link" href="#catalog" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 9, fontSize: 12 }}>Вернуться к вещам <ArrowRight size={14} /></a></div>
          <div className="story-mark">«Хорошая вещь не заполняет пространство — она делает его вашим»</div>
        </div>
      </section>
    </main>
    <footer className="footer"><Link href="/" className="brand">тихо.<small>дом и повседневность</small></Link><div className="footer-note">Алматы · Казахстан<br />Корзина хранится на устройстве</div><span className="mono" style={{ fontSize: 9 }}>© {new Date().getFullYear()} ТИХО</span></footer>
    {selectedProduct && <ProductDetailModal product={selectedProduct} onClose={() => setSelectedProduct(null)} onAdd={addProduct} />}\n    {cartOpen && <CartDrawer items={cart} onClose={() => setCartOpen(false)} onQty={changeQty} onRemove={removeItem} onOrderSubmitted={() => setCart([])} />}
  </div>;
}

type ProductDraft = {
  name: string; slug: string; category: string; description: string; price: string; imageUrl: string;
  badge: string; isFeatured: boolean; isActive: boolean;
};
const blankDraft: ProductDraft = { name: '', slug: '', category: '', description: '', price: '', imageUrl: '', badge: '', isFeatured: false, isActive: true };
function ProductEditor({ product, onClose, onSave, busy }: { product: Product | null; onClose: () => void; onSave: (data: ProductDraft) => void; busy: boolean }) {
  const [draft, setDraft] = useState<ProductDraft>(product ? {
    name: product.name, slug: product.slug, category: product.category, description: product.description,
    price: String(product.price), imageUrl: product.imageUrl, badge: product.badge || '',
    isFeatured: product.isFeatured, isActive: product.isActive,
  } : blankDraft);
  const change = (key: keyof ProductDraft, value: string | boolean) => setDraft((current) => ({ ...current, [key]: value }));
  const submit = (event: FormEvent) => { event.preventDefault(); onSave(draft); };
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <form className="form-modal" onSubmit={submit}>
      <h2>{product ? 'Изменить предмет' : 'Новый предмет'}</h2>
      <div className="form-grid">
        <label className="form-field">Название<input required value={draft.name} onChange={(e) => change('name', e.target.value)} data-testid="input-product-name" /></label>
        <label className="form-field">Ссылка<input required value={draft.slug} onChange={(e) => change('slug', e.target.value)} data-testid="input-product-slug" /></label>
        <label className="form-field">Категория<input required value={draft.category} onChange={(e) => change('category', e.target.value)} data-testid="input-product-category" /></label>
        <label className="form-field">Цена, ₸<input required min="0" type="number" value={draft.price} onChange={(e) => change('price', e.target.value)} data-testid="input-product-price" /></label>
        <label className="form-field full">Описание<textarea value={draft.description} onChange={(e) => change('description', e.target.value)} data-testid="input-product-description" /></label>
        <label className="form-field full">Ссылка на фотографию<input value={draft.imageUrl} onChange={(e) => change('imageUrl', e.target.value)} data-testid="input-product-image" /></label>
        <label className="form-field full">Метка<input placeholder="Например, Новинка" value={draft.badge} onChange={(e) => change('badge', e.target.value)} data-testid="input-product-badge" /></label>
      </div>
      <div className="check-row">
        <label><input type="checkbox" checked={draft.isFeatured} onChange={(e) => change('isFeatured', e.target.checked)} data-testid="checkbox-product-featured" /> В подборке</label>
        <label><input type="checkbox" checked={draft.isActive} onChange={(e) => change('isActive', e.target.checked)} data-testid="checkbox-product-active" /> Активен</label>
      </div>
      <div className="form-footer"><button type="button" className="secondary-button" onClick={onClose} data-testid="button-cancel-product">Отмена</button><button className="primary-button" disabled={busy} type="submit" data-testid="button-save-product">{busy ? 'Сохраняем…' : 'Сохранить предмет'}</button></div>
    </form>
  </div>;
}


function StorefrontSettingsEditor() {
  const { getToken } = useAuth();
  const [config, setConfig] = useState<StorefrontConfig>(defaultStorefront);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  useEffect(() => { fetch('/api/storefront/settings').then((r) => r.json()).then((data) => setConfig({ ...defaultStorefront, ...data, theme: { ...defaultStorefront.theme, ...(data.theme || {}) }, content: { ...defaultStorefront.content, ...(data.content || {}) }, blocks: Array.isArray(data.blocks) ? data.blocks : [] })).catch(() => setError('Не удалось загрузить настройки')).finally(() => setLoading(false)); }, []);
  const updateTheme = (key: keyof StorefrontConfig['theme'], value: string | number | boolean) => setConfig((c) => ({ ...c, theme: { ...c.theme, [key]: value } }));
  const updateContent = (key: keyof StorefrontConfig['content'], value: string) => setConfig((c) => ({ ...c, content: { ...c.content, [key]: value } }));
  const updateBlock = (index: number, key: keyof StorefrontBlock, value: string) => setConfig((c) => ({ ...c, blocks: c.blocks.map((b, i) => i === index ? { ...b, [key]: value } : b) }));
  async function save() {
    setSaving(true); setError(''); setSaved(false);
    try {
      const token = await getToken();
      const response = await fetch('/api/admin/storefront/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ config }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Не удалось сохранить оформление');
      setConfig(body.config); setSaved(true);
    } catch (e) { setError(e instanceof Error ? e.message : 'Ошибка сохранения'); }
    finally { setSaving(false); }
  }
  function addBlock(type: StorefrontBlock['type']) {
    setConfig((c) => ({ ...c, blocks: [...c.blocks, { id: 'block-' + Date.now(), type, title: type === 'text' ? 'Новый блок' : '', text: '', label: type === 'button' ? 'Открыть ссылку' : '', url: '', mediaUrl: '', background: '#f5f1e8', color: '#244c43', width: '100%', animation: 'lift' }] }));
  }
  function moveBlock(index: number, direction: number) {
    setConfig((c) => { const blocks = [...c.blocks]; const target = index + direction; if (target < 0 || target >= blocks.length) return c; const temp = blocks[index]; blocks[index] = blocks[target]; blocks[target] = temp; return { ...c, blocks }; });
  }
  if (loading) return <div className="skeleton" style={{ height: 220 }} />;
  return <section className="visual-editor">
    <div className="visual-editor-heading"><div><span className="eyebrow">Редактор сайта</span><h2>Оформление витрины</h2><p>Изменения сохраняются в базе данных и сразу применяются к публичному сайту.</p></div><button className="primary-button" onClick={() => void save()} disabled={saving}>{saving ? 'Сохраняем…' : 'Опубликовать оформление'}</button></div>
    {error && <p className="form-error" role="alert">{error}</p>}{saved && <p className="editor-saved" role="status">Оформление сохранено.</p>}
    <div className="visual-editor-grid">
      <div className="editor-group"><h3>Цвета и шрифты</h3><label className="form-field">Фон сайта<input type="color" value={config.theme.background} onChange={e => updateTheme('background', e.target.value)} /></label><label className="form-field">Цвет текста<input type="color" value={config.theme.text} onChange={e => updateTheme('text', e.target.value)} /></label><label className="form-field">Основной цвет / кнопки<input type="color" value={config.theme.accent} onChange={e => updateTheme('accent', e.target.value)} /></label><label className="form-field">Фон карточек<input type="color" value={config.theme.cardBackground} onChange={e => updateTheme('cardBackground', e.target.value)} /></label><label className="form-field">Градиент CSS<input value={config.theme.gradient} onChange={e => updateTheme('gradient', e.target.value)} placeholder="linear-gradient(...)" /></label><label className="form-field">Шрифт текста<select value={config.theme.font} onChange={e => updateTheme('font', e.target.value)}><option>DM Sans</option><option>Arial</option><option>Georgia</option><option>Inter</option><option>system-ui</option></select></label><label className="form-field">Шрифт заголовков<select value={config.theme.headingFont} onChange={e => updateTheme('headingFont', e.target.value)}><option>Cormorant Garamond</option><option>Georgia</option><option>Arial</option><option>DM Sans</option></select></label></div>
      <div className="editor-group"><h3>Сетка и анимации</h3><label className="form-field">Колонки каталога<select value={config.theme.cardColumns} onChange={e => updateTheme('cardColumns', Number(e.target.value))}><option value={2}>2 колонки</option><option value={3}>3 колонки</option><option value={4}>4 колонки</option><option value={5}>5 колонок</option></select></label><label className="form-field">Пропорции фото<select value={config.theme.imageRatio} onChange={e => updateTheme('imageRatio', e.target.value)}><option value="1 / 1">Квадрат 1:1</option><option value="4 / 5">Портрет 4:5</option><option value="3 / 2">Альбом 3:2</option><option value="16 / 9">Широкий 16:9</option></select></label><label className="form-field">Скругление карточек (px)<input type="number" min="0" max="40" value={config.theme.cardRadius} onChange={e => updateTheme('cardRadius', Number(e.target.value))} /></label><label className="form-field">Анимация<select value={config.theme.animation} onChange={e => updateTheme('animation', e.target.value)}><option value="lift">Подъём при наведении</option><option value="fade">Плавное появление</option><option value="glow">Свечение</option><option value="none">Без анимации</option></select></label><label className="form-field">Длительность (мс)<input type="number" min="0" max="2000" step="50" value={config.theme.animationDuration} onChange={e => updateTheme('animationDuration', Number(e.target.value))} /></label><label className="editor-check"><input type="checkbox" checked={config.theme.colorAnimation} onChange={e => updateTheme('colorAnimation', e.target.checked)} /> Анимировать цветовые переходы</label></div>
      <div className="editor-group editor-group-wide"><h3>Тексты, изображения и ссылки</h3><label className="form-field">Бегущая строка / объявление<input value={config.content.announcement} onChange={e => updateContent('announcement', e.target.value)} /></label><label className="form-field">Надзаголовок главного экрана<input value={config.content.heroEyebrow} onChange={e => updateContent('heroEyebrow', e.target.value)} /></label><label className="form-field">Заголовок (перенос строки через Enter)<textarea rows={2} value={config.content.heroTitle} onChange={e => updateContent('heroTitle', e.target.value)} /></label><label className="form-field">Описание главного экрана<textarea rows={3} value={config.content.heroText} onChange={e => updateContent('heroText', e.target.value)} /></label><label className="form-field">Текст кнопки<input value={config.content.heroButtonText} onChange={e => updateContent('heroButtonText', e.target.value)} /></label><label className="form-field">URL картинки главного экрана<input value={config.content.heroImage} onChange={e => updateContent('heroImage', e.target.value)} placeholder="/images/..." /></label><label className="form-field">Ссылка при нажатии на картинку<input value={config.content.heroImageLink} onChange={e => updateContent('heroImageLink', e.target.value)} placeholder="https://... или #catalog" /></label><label className="form-field">Заголовок блока «О нас»<textarea rows={2} value={config.content.storyTitle} onChange={e => updateContent('storyTitle', e.target.value)} /></label><label className="form-field">Текст «О нас»<textarea rows={3} value={config.content.storyText} onChange={e => updateContent('storyText', e.target.value)} /></label></div>
    </div>
    <div className="editor-group editor-group-wide"><div className="editor-blocks-heading"><div><h3>Свободные блоки страницы</h3><p>Меняйте порядок, размер, цвет, текст, медиа и ссылку каждого блока.</p></div><div className="editor-add-blocks">{(['text','image','video','audio','button','embed'] as StorefrontBlock['type'][]).map(type => <button key={type} className="secondary-button" onClick={() => addBlock(type)}>+ {({text:'Текст',image:'Фото',video:'Видео',audio:'Аудио',button:'Кнопка',embed:'Встраивание'} as Record<string,string>)[type]}</button>)}</div></div>
      {config.blocks.map((block, index) => <div className="editor-block" key={block.id}><div className="editor-block-top"><strong>{index + 1}. {block.type}</strong><div><button className="plain-icon" onClick={() => moveBlock(index, -1)} disabled={index === 0} aria-label="Переместить выше"><ChevronUp size={16}/></button><button className="plain-icon" onClick={() => moveBlock(index, 1)} disabled={index === config.blocks.length - 1} aria-label="Переместить ниже"><ChevronDown size={16}/></button><button className="plain-icon" onClick={() => setConfig(c => ({...c, blocks:c.blocks.filter((_,i)=>i!==index)}))} aria-label="Удалить блок"><Trash2 size={15}/></button></div></div>
        <div className="editor-block-fields"><label className="form-field">Заголовок / подпись<input value={block.title || ''} onChange={e => updateBlock(index, 'title', e.target.value)} /></label>{(block.type === 'text') && <label className="form-field">Текст<textarea rows={3} value={block.text || ''} onChange={e => updateBlock(index, 'text', e.target.value)} /></label>}{block.type === 'button' && <label className="form-field">Текст кнопки<input value={block.label || ''} onChange={e => updateBlock(index, 'label', e.target.value)} /></label>}{(['image','video','audio','embed'] as string[]).includes(block.type) && <label className="form-field">URL медиа / встраивания<input value={block.mediaUrl || ''} onChange={e => updateBlock(index, 'mediaUrl', e.target.value)} /></label>}<label className="form-field">Ссылка при нажатии<input value={block.url || ''} onChange={e => updateBlock(index, 'url', e.target.value)} placeholder="https://... или /catalog" /></label><label className="form-field">Фон<input value={block.background || ''} onChange={e => updateBlock(index, 'background', e.target.value)} placeholder="#ffffff или linear-gradient(...)" /></label><label className="form-field">Цвет текста<input value={block.color || ''} onChange={e => updateBlock(index, 'color', e.target.value)} placeholder="#244c43" /></label><label className="form-field">Ширина<input value={block.width || '100%'} onChange={e => updateBlock(index, 'width', e.target.value)} placeholder="100%, 50%, 600px" /></label></div>
      </div>)}
      {!config.blocks.length && <p className="editor-empty">Пока нет блоков. Добавьте текст, картинку, видео, аудио или кнопку выше.</p>}
    </div>
    <div className="visual-editor-bottom"><button className="primary-button" onClick={() => void save()} disabled={saving}>{saving ? 'Сохраняем…' : 'Сохранить и опубликовать'}</button></div>
  </section>;
}

function AdminGate() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const { signOut } = useClerk();
  const [, navigate] = useLocation();
  const [signingOut, setSigningOut] = useState(false);
  const adminDisplayName = user?.fullName || user?.firstName || user?.primaryEmailAddress?.emailAddress || 'Администратор';
  async function handleAdminSignOut() {
    setSigningOut(true);
    try {
      await signOut({ redirectUrl: `${basePath}/` || '/' });
      navigate('/');
    } finally {
      setSigningOut(false);
    }
  }
  const [tokenReady, setTokenReady] = useState(false);
  useEffect(() => {
    if (!isLoaded) return;
    setAuthTokenGetter(() => getToken());
    setTokenReady(true);
    return () => setAuthTokenGetter(null);
  }, [getToken, isLoaded]);
  const overviewQuery = useGetAdminOverview({
    query: { queryKey: getGetAdminOverviewQueryKey(), enabled: isLoaded && isSignedIn === true && tokenReady, retry: false },
  });
  const productsQuery = useListAdminProducts({
    query: { queryKey: getListAdminProductsQueryKey(), enabled: isLoaded && isSignedIn === true && tokenReady, retry: false },
  });
  const [activeView, setActiveView] = useState<'overview' | 'products' | 'orders' | 'settings'>('overview');
  const [orders, setOrders] = useState<any[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState('');
  const [moderatingId, setModeratingId] = useState<number | null>(null);
  useEffect(() => {
    if (activeView !== 'orders' || !isLoaded || !isSignedIn) return;
    let cancelled = false;
    setOrdersLoading(true);
    void getToken().then(token => fetch('/api/admin/orders', { headers: token ? { Authorization: 'Bearer ' + token } : {} }))
      .then(async response => { const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Не удалось загрузить заказы'); return body; })
      .then(body => { if (!cancelled) setOrders(Array.isArray(body) ? body : []); })
      .catch(error => { if (!cancelled) setOrdersError(error instanceof Error ? error.message : 'Ошибка загрузки'); })
      .finally(() => { if (!cancelled) setOrdersLoading(false); });
    return () => { cancelled = true; };
  }, [activeView, getToken, isLoaded, isSignedIn]);
  async function moderateOrder(id: number, status: 'approved' | 'rejected') {
    setModeratingId(id);
    try {
      const token = await getToken();
      const response = await fetch('/api/admin/orders/' + id + '/moderation', { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ status }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Не удалось обновить заказ');
      setOrders(current => current.map(order => order.id === id ? { ...order, ...body } : order));
    } catch (error) { setOrdersError(error instanceof Error ? error.message : 'Ошибка модерации'); }
    finally { setModeratingId(null); }
  }
  const [editor, setEditor] = useState<Product | null | undefined>(undefined);
  const [filter, setFilter] = useState('');
  const [notice, setNotice] = useState('');
  const queryClient = useQueryClient();
  const create = useCreateProduct({ mutation: { onSuccess: () => refreshAdmin() } });
  const update = useUpdateProduct({ mutation: { onSuccess: () => refreshAdmin() } });
  const remove = useDeleteProduct({ mutation: { onSuccess: () => refreshAdmin() } });
  function refreshAdmin() {
    void queryClient.invalidateQueries({ queryKey: getGetAdminOverviewQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getListAdminProductsQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getGetStoreSummaryQueryKey() });
    setEditor(undefined);
    setNotice('Изменения сохранены');
  }
  const isLoading = !isLoaded || (isSignedIn === true && (!tokenReady || overviewQuery.isLoading || productsQuery.isLoading));
  const isError = overviewQuery.isError || productsQuery.isError;
  const overview = overviewQuery.data;
  const adminProducts = productsQuery.data ?? [];
  const visibleProducts = adminProducts.filter((product) => `${product.name} ${product.category}`.toLocaleLowerCase().includes(filter.toLocaleLowerCase()));
  const busy = create.isPending || update.isPending;

  if (isLoading) return <div className="admin-layout"><div className="admin-sidebar"><span className="brand">тихо.<small>управление</small></span></div><div className="admin-main"><div className="admin-content"><div className="skeleton" style={{ height: 60, marginBottom: 28 }} /><div className="stat-grid">{[1, 2, 3, 4].map((i) => <div key={i} className="skeleton" style={{ height: 120 }} />)}</div><div className="skeleton" style={{ height: 260 }} /></div></div></div>;
  if (isError || !overview) return <div className="admin-layout"><div className="gate-card">
    <span className="eyebrow">{isSignedIn ? 'Доступ ограничен' : 'Закрытый раздел'}</span>
    <h1>{isSignedIn ? 'Нет прав администратора' : 'Вход в магазин'}</h1>
    <p>{isSignedIn
      ? 'Вы вошли в аккаунт, но у него нет подтверждённого доступа к панели управления. Обычный магазин доступен без прав администратора.'
      : 'Панель управления доступна только администраторам. Войдите в аккаунт, которому выдан доступ.'}</p>
    {!isSignedIn && <Link className="cta" href="/sign-in" data-testid="link-admin-sign-in">Войти в аккаунт <ArrowRight size={15} /></Link>}
    <button className="secondary-button" style={{ marginLeft: 8 }} onClick={() => { void overviewQuery.refetch(); void productsQuery.refetch(); }} data-testid="button-retry-admin">Проверить доступ</button>
    <div className="gate-actions" style={{ marginTop: 17 }}>
      <Link className="quiet-link" href="/" data-testid="link-return-store">Вернуться в магазин</Link>
      {isSignedIn && <button className="account-logout" onClick={() => void handleAdminSignOut()} disabled={signingOut} data-testid="button-admin-gate-sign-out"><LogOut size={15} />{signingOut ? 'Выходим…' : 'Выйти из аккаунта'}</button>}
    </div>
  </div></div>;

  return <div className="admin-layout">
    <aside className="admin-sidebar">
      <Link className="brand" href="/" data-testid="link-admin-home">тихо.<small>управление</small></Link>
      <div><div className="admin-label">Рабочее пространство</div><nav className="admin-nav">
        <button className={activeView === 'overview' ? 'selected' : ''} onClick={() => setActiveView('overview')} data-testid="button-admin-overview"><Leaf size={16} />Обзор</button>
        <button className={activeView === 'products' ? 'selected' : ''} onClick={() => setActiveView('products')} data-testid="button-admin-products"><Package size={16} />Предметы</button>
        <button className={activeView === 'orders' ? 'selected' : ''} onClick={() => setActiveView('orders')} data-testid="button-admin-orders"><ClipboardList size={16} />Заказы</button>
        <button className={activeView === 'settings' ? 'selected' : ''} onClick={() => setActiveView('settings')} data-testid="button-admin-settings"><Settings size={16} />Оформление сайта</button>
      </nav></div>
      <div><div className="admin-label">Публичный магазин</div><Link className="quiet-link" style={{ color: '#d7dfd3', fontSize: 12, padding: 12, display: 'flex', alignItems: 'center', gap: 9 }} href="/" data-testid="link-view-store">Открыть витрину <ArrowRight size={13} /></Link></div>
    </aside>
    <main className="admin-main"><div className="admin-content">
      <div className="admin-top">
        <div><div className="eyebrow">Тихо · администрирование</div><h1>{activeView === 'overview' ? 'Обзор магазина' : activeView === 'products' ? 'Каталог предметов' : activeView === 'orders' ? 'Модерация заказов' : 'Оформление сайта'}</h1></div>
        <div className="admin-top-actions">
          <div className="admin-account" title={user?.primaryEmailAddress?.emailAddress || adminDisplayName}>
            {user?.imageUrl ? <img src={user.imageUrl} alt="" /> : <span className="admin-account-fallback"><UserRound size={15} /></span>}
            <span><strong>{adminDisplayName}</strong><small>{user?.primaryEmailAddress?.emailAddress || 'Администратор'}</small></span>
          </div>
          <Link className="admin-store-switch" href="/" data-testid="button-switch-to-store"><ShoppingBag size={15} /> Обычный сайт</Link>
          <button className="account-logout" onClick={() => void handleAdminSignOut()} disabled={signingOut} data-testid="button-admin-sign-out"><LogOut size={15} /><span>{signingOut ? 'Выходим…' : 'Выйти'}</span></button>
          {activeView === 'products' && <button className="primary-button" onClick={() => setEditor(null)} data-testid="button-create-product"><Plus size={15} /> Новый предмет</button>}
        </div>
      </div>
      {notice && <p role="status" style={{ color: '#486d53', fontSize: 12 }} data-testid="status-admin-notice">{notice}<button className="plain-icon" onClick={() => setNotice('')} aria-label="Закрыть сообщение"><X size={13} /></button></p>}
      {activeView === 'settings' ? <StorefrontSettingsEditor /> : activeView === 'orders' ? <section className="orders-panel">
        <div className="orders-intro"><span className="eyebrow">Ручная проверка</span><p>Подтверждение заказа не означает, что оплата уже получена.</p></div>
        {ordersError && <p className="form-error" role="alert">{ordersError}</p>}
        {ordersLoading ? <div className="skeleton" style={{height:160}} /> : orders.length ? <div className="order-list">{orders.map(order => <article className="order-card" key={order.id}>
          <div className="order-card-head"><div><span className="order-number">ЗАКАЗ №{order.id}</span><small>{new Date(order.created_at).toLocaleString('ru-RU')}</small></div><span className={'status-pill order-status ' + order.status}>{order.status === 'pending' ? 'На проверке' : order.status === 'approved' ? 'Подтверждён' : 'Отклонён'}</span></div>
          <div className="order-customer"><strong>{order.customer_name}</strong><span>{order.customer_phone}</span>{order.customer_email && <span>{order.customer_email}</span>}<span>{order.delivery_address}</span>{order.customer_note && <p>Комментарий: {order.customer_note}</p>}</div>
          <div className="order-items">{(Array.isArray(order.items) ? order.items : []).map((item: any, index: number) => <div className="order-item" key={item.productId || index}><span>{item.name} × {item.quantity}</span><strong>{money(Number(item.price) * Number(item.quantity))}</strong></div>)}</div>
          <div className="order-total"><span>Итого</span><strong>{money(Number(order.total_amount))}</strong></div>
          {order.status === 'pending' && <div className="order-actions"><button className="primary-button" disabled={moderatingId === Number(order.id)} onClick={() => void moderateOrder(Number(order.id), 'approved')}><Check size={14} /> Подтвердить</button><button className="secondary-button" disabled={moderatingId === Number(order.id)} onClick={() => void moderateOrder(Number(order.id), 'rejected')}><Ban size={14} /> Отклонить</button></div>}
        </article>)}</div> : <div className="empty-state">Пока нет заявок.<br/><span style={{fontSize:13}}>Здесь появятся новые заказы.</span></div>}
      </section> : activeView === 'overview' ? <>
        <div className="stat-grid">
          <div className="stat-card" data-testid="stat-total-products"><span>Всего предметов</span><strong>{overview.totalProducts}</strong></div>
          <div className="stat-card" data-testid="stat-active-products"><span>В витрине</span><strong>{overview.activeProducts}</strong></div>
          <div className="stat-card" data-testid="stat-inactive-products"><span>Скрыто</span><strong>{overview.inactiveProducts}</strong></div>
          <div className="stat-card" data-testid="stat-categories"><span>Категории</span><strong>{overview.categoryCount}</strong></div>
        </div>
        <div className="section-head" style={{ marginTop: 36 }}><div><span className="eyebrow">Последние в каталоге</span><h2 style={{ fontSize: 43 }}>Недавние предметы</h2></div><button className="secondary-button" onClick={() => setActiveView('products')} data-testid="button-view-all-products">Все предметы <ArrowRight size={13} style={{ verticalAlign: 'middle' }} /></button></div>
        <ProductTable products={adminProducts.slice(0, 5)} onEdit={(item) => setEditor(item)} onDelete={(item) => {
          if (window.confirm(`Удалить «${item.name}»? Это действие нельзя отменить.`)) remove.mutate({ id: item.id });
        }} />
      </> : <>
        <div className="catalog-tools" style={{ margin: '24px 0 16px' }}>
          <label style={{ position: 'relative', flex: 1, maxWidth: 340 }}><Search size={15} style={{ position: 'absolute', left: 11, top: 11, color: '#829086' }} /><input className="search-field" style={{ paddingLeft: 34, width: '100%' }} placeholder="Название или категория" value={filter} onChange={(e) => setFilter(e.target.value)} data-testid="input-admin-search" /></label>
          <span className="mono" style={{ fontSize: 10 }}>{visibleProducts.length} / {adminProducts.length}</span>
        </div>
        <ProductTable products={visibleProducts} onEdit={(item) => setEditor(item)} onDelete={(item) => {
          if (window.confirm(`Удалить «${item.name}»? Это действие нельзя отменить.`)) remove.mutate({ id: item.id });
        }} />
      </>}
      {remove.isError && <p role="alert" style={{ color: '#a3483d', fontSize: 12 }}>Не удалось удалить предмет. Попробуйте ещё раз.</p>}
      {(create.isError || update.isError) && <p role="alert" style={{ color: '#a3483d', fontSize: 12 }}>Не удалось сохранить изменения. Проверьте поля и повторите.</p>}
    </div></main>
    {editor !== undefined && <ProductEditor product={editor} onClose={() => setEditor(undefined)} busy={busy} onSave={(draft) => {
      const data = {
        name: draft.name.trim(), slug: draft.slug.trim(), category: draft.category.trim(), description: draft.description.trim(),
        price: Number(draft.price), imageUrl: draft.imageUrl.trim(), badge: draft.badge.trim() || null,
        isFeatured: draft.isFeatured, isActive: draft.isActive,
      };
      if (!Number.isFinite(data.price) || data.price < 0) { setNotice('Укажите корректную цену'); return; }
      if (editor) update.mutate({ id: editor.id, data }); else create.mutate({ data });
    }} />}
  </div>;
}

function ProductTable({ products, onEdit, onDelete }: { products: Product[]; onEdit: (product: Product) => void; onDelete: (product: Product) => void }) {
  return <div className="admin-table-wrap">
    {products.length ? <table className="admin-table"><thead><tr><th>Предмет</th><th>Категория</th><th>Цена</th><th>Статус</th><th>Действия</th></tr></thead>
      <tbody>{products.map((product, index) => <tr key={product.id} data-testid={`row-product-${product.id}`}>
        <td><div className="admin-prod"><img src={productImage(product, index)} alt="" /><span>{product.name}</span></div></td>
        <td>{product.category}</td><td className="mono">{money(product.price)}</td><td><span className={`status-pill ${product.isActive ? '' : 'off'}`}>{product.isActive ? 'В витрине' : 'Скрыт'}</span></td>
        <td><div className="table-actions"><button onClick={() => onEdit(product)} aria-label={`Редактировать ${product.name}`} data-testid={`button-edit-${product.id}`}><Pencil size={14} /></button><button onClick={() => onDelete(product)} aria-label={`Удалить ${product.name}`} data-testid={`button-delete-${product.id}`}><Trash2 size={14} /></button></div></td>
      </tr>)}</tbody></table> : <div className="empty-state" data-testid="empty-admin-products">Пока нет предметов.<br /><span style={{ fontSize: 13 }}>Добавьте первую вещь в коллекцию.</span></div>}
  </div>;
}

function BrandedSignIn() {
  return <div className="auth-page"><aside className="auth-side"><Link href="/" className="brand" style={{ color: '#f7f2e8' }}>тихо.<small>дом и повседневность</small></Link><div><span className="eyebrow" style={{ color: '#d6a08d' }}>Ваше тихое место</span><h1>Рады, что вы вернулись.</h1><p>Войдите, чтобы продолжить управлять коллекцией и сохранить свои любимые находки.</p></div><span className="mono" style={{ fontSize: 9, letterSpacing: '.12em' }}>АЛМАТЫ · КАЗАХСТАН</span></aside>
    <div className="auth-form-area"><div className="clerk-auth-card"><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} forceRedirectUrl={`${basePath}/`} fallback={<div role="status" style={{ padding: 24, color: "#244c43", textAlign: "center" }}>Загрузка формы входа…</div>} /></div></div></div>;
}
function BrandedSignUp() {
  return <div className="auth-page"><aside className="auth-side"><Link href="/" className="brand" style={{ color: '#f7f2e8' }}>тихо.<small>дом и повседневность</small></Link><div><span className="eyebrow" style={{ color: '#d6a08d' }}>В хорошей компании</span><h1>Меньше шума. Больше любимых вещей.</h1><p>Создайте аккаунт для нашей небольшой команды и бережно собирайте каталог.</p></div><span className="mono" style={{ fontSize: 9, letterSpacing: '.12em' }}>АЛМАТЫ · КАЗАХСТАН</span></aside>
    <div className="auth-form-area"><div className="clerk-auth-card"><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} forceRedirectUrl={`${basePath}/`} fallback={<div role="status" style={{ padding: 24, color: "#244c43", textAlign: "center" }}>Загрузка формы регистрации…</div>} /></div></div></div>;
}

function ClerkCacheInvalidator() {
  const { addListener } = useClerk();
  const client = useQueryClient();
  const previous = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const id = user?.id ?? null;
      if (previous.current !== undefined && previous.current !== id) client.clear();
      previous.current = id;
    });
    return unsubscribe;
  }, [addListener, client]);
  return null;
}

function HomeRoute() {
  return <Catalog />;
}

function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function ClerkRoutes() {
  const [, setLocation] = useLocation();
  return <ClerkProvider
    publishableKey={clerkPubKey}
    proxyUrl={clerkProxyUrl}
    appearance={clerkAppearance}
    signInUrl={`${basePath}/sign-in`}
    signUpUrl={`${basePath}/sign-up`}
    signInFallbackRedirectUrl={`${basePath}/`}
    signUpFallbackRedirectUrl={`${basePath}/admin`}
    localization={{
      ...ruRU,
      signIn: {
        ...ruRU.signIn,
        start: { ...ruRU.signIn?.start, title: 'Добро пожаловать', subtitle: 'Войдите в свой аккаунт' },
      },
      signUp: {
        ...ruRU.signUp,
        start: { ...ruRU.signUp?.start, title: 'Создать аккаунт', subtitle: 'Используйте подтверждённый email' },
      },
    }}
    routerPush={(to) => setLocation(stripBase(to))}
    routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
  >
    <QueryClientProvider client={queryClient}>
      <ClerkCacheInvalidator />
      <RouteErrorBoundary>
        <Switch>
          <Route path="/" component={HomeRoute} />
          <Route path="/admin" component={AdminGate} />
          <Route path="/sign-in/*?" component={BrandedSignIn} />
          <Route path="/sign-up/*?" component={BrandedSignUp} />
          <Route component={NotFound} />
        </Switch>
      </RouteErrorBoundary>
    </QueryClientProvider>
  </ClerkProvider>;
}

function App() {
  return <TooltipProvider><WouterRouter base={basePath}><ClerkRoutes /></WouterRouter><Toaster /></TooltipProvider>;
}

export default App;
