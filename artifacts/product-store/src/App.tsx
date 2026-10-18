import { Fragment, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode, type MouseEvent, type TouchEvent } from 'react';
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

function ShopHeader({ count, onCart, announcement, content }: { count: number; onCart: () => void; announcement: string; content: StorefrontConfig['content'] }) {
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

  return <div data-site-section="header" data-element-id="header">
    <div className="announcement">{announcement}</div>
    <header className="header">
      <Link href="/" className="brand" data-testid="link-home" data-element-id="home-brand">{content.siteName || "тихо."}<small>{content.siteTagline || "дом и повседневность"}</small></Link>
      <nav className="header-links" aria-label="Главная навигация">
        <a className="quiet-link" href="#catalog" data-element-id="nav-catalog">{content.navCatalogLabel || "Каталог"}</a>
        <a className="quiet-link" href="#about" data-element-id="nav-about">{content.navAboutLabel || "О нас"}</a>
        <AdminHeaderLink />
        {!isLoaded ? <span className="account-loading" role="status">Проверяем аккаунт…</span> : isSignedIn && user ? <>
          <div className="account-profile" data-testid="account-profile" title={user.primaryEmailAddress?.emailAddress || displayName}>
            {user.imageUrl ? <img className="account-avatar" src={user.imageUrl} alt="" /> : <span className="account-avatar-fallback"><UserRound size={16} /></span>}
            <span className="account-profile-text"><strong>{displayName}</strong><small>{user.primaryEmailAddress?.emailAddress || 'Вы вошли в аккаунт'}</small></span>
          </div>
          <button className="account-logout" onClick={() => void handleSignOut()} disabled={signingOut} data-testid="button-sign-out">
            <LogOut size={15} /><span>{signingOut ? 'Выходим…' : 'Выйти'}</span>
          </button>
        </> : <Link className="quiet-link" href="/sign-in" data-testid="link-sign-in">{content.signInLabel || "Войти"}</Link>}
        <button className="icon-button" onClick={onCart} data-testid="button-open-cart" data-element-id="cart-toggle" aria-label="Открыть корзину">
          <ShoppingBag size={18} strokeWidth={1.5} /><span>{content.cartLabel || "Корзина"}</span><span className="cart-count" data-testid="text-cart-count">{count}</span>
        </button>
      </nav>
    </header>
  </div>;
}

function ProductCard({ product, index, onAdd, onOpen }: { product: Product; index: number; onAdd: (product: Product) => void; onOpen: (product: Product) => void }) {
  return <article className="product-card" data-element-id="product-card" data-testid={`card-product-${product.id}`} onClick={() => onOpen(product)} tabIndex={0} role="button" onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpen(product); } }} aria-label={`Открыть товар ${product.name}`}>
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
  return <div className="drawer-backdrop" data-element-id="cart-panel" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
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


type StorefrontBlock = { id: string; type: 'text' | 'image' | 'video' | 'audio' | 'button' | 'embed' | 'map'; title?: string; text?: string; label?: string; url?: string; mediaUrl?: string; background?: string; color?: string; width?: string; columns?: number; height?: string; fontSize?: string; titleSize?: string; padding?: string; radius?: number; textAlign?: 'left' | 'center' | 'right'; objectFit?: 'cover' | 'contain'; targetBlank?: boolean; animation?: string };
type WorkflowTrigger = 'page-load' | 'click' | 'swipe-left' | 'swipe-right';
type WorkflowCondition = 'always' | 'mobile' | 'desktop' | 'cart-has-items' | 'url-contains';
type WorkflowAction = 'show' | 'hide' | 'toggle' | 'animate' | 'scroll' | 'navigate' | 'open-link' | 'play-video' | 'show-message';
type WorkflowRule = { id: string; name: string; enabled: boolean; trigger: WorkflowTrigger; listenOn: string; condition: WorkflowCondition; conditionValue?: string; action: WorkflowAction; targetId?: string; value?: string };
type SectionKey = 'hero' | 'ticker' | 'catalog' | 'custom' | 'story';
type AdminTheme = { background: string; sidebar: string; accent: string; text: string; surface: string; font: string; radius: number };
type StorefrontConfig = { theme: { background: string; text: string; accent: string; accentText: string; cardBackground: string; gradient: string; heroLayout: string; font: string; headingFont: string; cardRadius: number; cardColumns: number; imageRatio: string; animation: string; animationDuration: number; colorAnimation: boolean }; adminTheme: AdminTheme; sections: { header: boolean; hero: boolean; ticker: boolean; catalog: boolean; custom: boolean; story: boolean; footer: boolean }; sectionOrder: SectionKey[]; content: { siteName: string; siteTagline: string; navCatalogLabel: string; navAboutLabel: string; cartLabel: string; signInLabel: string; announcement: string; heroEyebrow: string; heroTitle: string; heroText: string; heroImage: string; heroImageLink: string; heroButtonText: string; heroButtonUrl: string; heroIndexText: string; heroNote: string; ticker1: string; ticker2: string; ticker3: string; catalogEyebrow: string; catalogTitle: string; searchPlaceholder: string; storyEyebrow: string; storyTitle: string; storyText: string; storyQuote: string; storyLinkText: string; storyLinkUrl: string; footerLocation: string; footerNote: string; copyrightLabel: string }; blocks: StorefrontBlock[]; workflows: WorkflowRule[] };
const defaultStorefront: StorefrontConfig = {
  theme: { background: '#f5f1e8', text: '#244c43', accent: '#244c43', accentText: '#fffaf1', cardBackground: '#fffdf7', gradient: 'linear-gradient(135deg, #f5f1e8 0%, #e5ded0 100%)', font: 'DM Sans', headingFont: 'Cormorant Garamond', cardRadius: 8, cardColumns: 3, imageRatio: '4 / 5', animation: 'lift', animationDuration: 240, colorAnimation: false, heroLayout: 'split' },
  content: { siteName: 'тихо.', siteTagline: 'дом и повседневность', navCatalogLabel: 'Каталог', navAboutLabel: 'О нас', cartLabel: 'Корзина', signInLabel: 'Войти', announcement: 'Доставка по Казахстану · бесплатно от 35 000 ₸', heroEyebrow: 'Маленькая коллекция для дома', heroTitle: 'Жить\nчуть тише.', heroText: 'Вещи, которые не требуют внимания — только становятся частью хорошего дня. Собираем их небольшими партиями.', heroImage: '/images/orbit-vase.png', heroImageLink: '', heroButtonText: 'Смотреть коллекцию', heroButtonUrl: '#catalog', heroIndexText: 'ПРЕДМЕТЫ С ХАРАКТЕРОМ · № 01', heroNote: 'Найдено и выбрано в Казахстане', ticker1: 'С любовью к деталям', ticker2: 'Небольшие тиражи', ticker3: 'Сделано на каждый день', catalogEyebrow: 'Наш выбор', catalogTitle: 'Предметы\nна каждый день', searchPlaceholder: 'Найти вещь', storyEyebrow: 'Небольшое объяснение', storyTitle: 'Не больше.\nЛучше.', storyText: '«Тихо» — маленький магазин вещей, которые приятно держать рядом.', storyQuote: '«Хорошая вещь не заполняет пространство — она делает его вашим»', storyLinkText: 'Вернуться к вещам', storyLinkUrl: '#catalog', footerLocation: 'Алматы · Казахстан', footerNote: 'Корзина хранится на устройстве', copyrightLabel: 'ТИХО' },
  adminTheme: { background: '#f2eee5', sidebar: '#244c43', accent: '#356257', text: '#244c43', surface: '#faf7f0', font: 'DM Sans', radius: 8 },
  sections: { header: true, hero: true, ticker: true, catalog: true, custom: true, story: true, footer: true },
  sectionOrder: ['hero', 'ticker', 'catalog', 'custom', 'story'],
  blocks: [], workflows: [],
};
function normalizeSourceUrl(value: string): string {
  const input = (value || '').trim();
  if (!input || /^(https?:|mailto:|tel:|data:|blob:|\/|#)/i.test(input)) return input;
  if (/^[a-z0-9.-]+\.[a-z]{2,}(?::\d+)?(?:[/?#].*)?$/i.test(input)) return 'https://' + input;
  return input;
}
function youtubeVideoId(value: string): string | null {
  try {
    const url = new URL(normalizeSourceUrl(value));
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'youtu.be') return url.pathname.split('/').filter(Boolean)[0] || null;
    if (host.endsWith('youtube.com') || host === 'youtube-nocookie.com') {
      if (url.pathname === '/watch') return url.searchParams.get('v');
      const parts = url.pathname.split('/').filter(Boolean);
      if (['embed', 'shorts', 'live'].includes(parts[0] || '')) return parts[1] || null;
    }
  } catch { /* A relative URL or a non-YouTube source is handled below. */ }
  return null;
}
function mediaEmbedUrl(value: string, type: StorefrontBlock['type']): string {
  const normalized = normalizeSourceUrl(value);
  const videoId = youtubeVideoId(normalized);
  if (type === 'embed' && videoId) return 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(videoId);
  try {
    const url = new URL(normalized);
    if (type === 'embed' && ['t.me', 'telegram.me', 'www.t.me'].includes(url.hostname.toLowerCase()) && url.pathname.split('/').filter(Boolean).length >= 2) {
      url.searchParams.set('embed', '1');
      url.searchParams.set('mode', 'tme');
      return url.toString();
    }
  } catch { /* Keep relative and local asset paths unchanged. */ }
  return normalized;
}
function StorefrontBlocks({ blocks }: { blocks: StorefrontBlock[] }) {
  if (!blocks.length) return null;
  return <section className="custom-blocks">{blocks.map((block) => {
    const columns = Math.max(1, Math.min(12, Number(block.columns ?? 12)));
    const mediaHeight = block.height && block.height !== 'auto' ? block.height : '640px';
    const style: any = {
      background: block.background || 'transparent',
      color: block.color || 'inherit',
      width: block.width || '100%',
      minHeight: block.height && block.height !== 'auto' ? block.height : undefined,
      fontSize: block.fontSize || undefined,
      padding: block.padding || '22px',
      borderRadius: String(Math.max(0, Math.min(48, Number(block.radius ?? 0)))) + 'px',
      textAlign: block.textAlign || 'left',
      gridColumn: 'span ' + columns,
    };
    let content: ReactNode;
    if (block.type === 'text') content = <div className="custom-block-copy"><h2 style={{ fontSize: block.titleSize && block.titleSize !== 'inherit' ? block.titleSize : undefined }}>{block.title}</h2><p>{block.text}</p></div>;
    else if (block.type === 'image') content = <img className="custom-block-media" style={{ objectFit: block.objectFit || 'contain', maxHeight: mediaHeight }} src={block.mediaUrl} alt={block.title || ''} />;
    else if (block.type === 'video') content = <video className="custom-block-media" style={{ objectFit: block.objectFit || 'contain', maxHeight: mediaHeight }} src={block.mediaUrl} controls playsInline />;
    else if (block.type === 'audio') content = <audio src={block.mediaUrl} controls />;
    else if (block.type === 'embed') content = <iframe className="custom-block-embed" src={mediaEmbedUrl(block.mediaUrl || '', 'embed')} title={block.title || 'Встроенный контент'} loading="lazy" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />;
    else if (block.type === 'map') content = <div className="custom-block-map-wrap"><iframe className="custom-block-map" src={mediaEmbedUrl(block.mediaUrl || '', 'map')} title={block.title || 'Карта 2ГИС'} loading="lazy" allowFullScreen /><a href={normalizeSourceUrl(block.mediaUrl || '')} target="_blank" rel="noreferrer">Открыть карту в источнике <ExternalLink size={14} /></a></div>;
    else content = <span>{block.label || block.title || 'Открыть'} <ExternalLink size={14} /></span>;
    const normalizedBlockUrl = normalizeSourceUrl(block.url || '');
    const externalLink = /^https?:/.test(normalizedBlockUrl);
    return <div className={'custom-block custom-block-' + block.type} key={block.id} data-element-id={block.id} data-block-id={block.id} data-animation={block.animation || 'fade'} data-gradient={/gradient\s*\(/i.test(block.background || '') ? 'true' : 'false'} style={style}>
      {block.url ? <a href={normalizedBlockUrl} target={block.targetBlank || externalLink ? '_blank' : undefined} rel={block.targetBlank || externalLink ? 'noreferrer' : undefined}>{content}</a> : content}
    </div>;
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
  const [workflowNotice, setWorkflowNotice] = useState('');
  const [storefrontLoaded, setStorefrontLoaded] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const [cart, setCart] = useState<CartItem[]>(() => {
    try { return restoreCart(localStorage.getItem('tihoshop-cart')); } catch { return []; }
  });
  const listParams = useMemo(() => ({ ...(search.trim() ? { search: search.trim() } : {}), ...(category ? { category } : {}) }), [search, category]);
  const productsQuery = useListProducts(listParams);
  useEffect(() => { fetch('/api/storefront/settings').then((r) => r.ok ? r.json() : null).then((config) => { if (config && config.theme && config.content && Array.isArray(config.blocks)) setStorefront({ ...defaultStorefront, ...config, theme: { ...defaultStorefront.theme, ...config.theme }, content: { ...defaultStorefront.content, ...config.content }, blocks: Array.isArray(config.blocks) ? config.blocks : [], workflows: Array.isArray(config.workflows) ? config.workflows : [] }); }).catch(() => undefined).finally(() => setStorefrontLoaded(true)); }, []);
  const runWorkflows = (trigger: WorkflowTrigger, sourceId = 'any') => {
    for (const rule of storefront.workflows || []) {
      if (!rule.enabled || rule.trigger !== trigger) continue;
      if (trigger === 'click' && rule.listenOn !== 'any' && rule.listenOn !== sourceId) continue;
      let conditionPassed = true;
      if (rule.condition === 'mobile') conditionPassed = window.matchMedia('(max-width: 700px)').matches;
      if (rule.condition === 'desktop') conditionPassed = !window.matchMedia('(max-width: 700px)').matches;
      if (rule.condition === 'cart-has-items') conditionPassed = cart.length > 0;
      if (rule.condition === 'url-contains') conditionPassed = window.location.href.includes(rule.conditionValue || '');
      if (!conditionPassed) continue;
      const targets = Array.from(document.querySelectorAll<HTMLElement>('[data-element-id]')).filter((el) => el.dataset.elementId === (rule.targetId || ''));
      const target = targets[0];
      const targetList = rule.targetId === 'product-card' ? targets : targets.slice(0, 1);
      if (rule.action === 'show') targetList.forEach((el) => { el.hidden = false; });
      else if (rule.action === 'hide') targetList.forEach((el) => { el.hidden = true; });
      else if (rule.action === 'toggle') targetList.forEach((el) => { el.hidden = !el.hidden; });
      else if (rule.action === 'animate') targetList.forEach((el) => {
        el.dataset.workflowAnimation = rule.value || 'pulse';
        el.classList.remove('workflow-animate');
        void el.offsetWidth;
        el.classList.add('workflow-animate');
      });
      else if (rule.action === 'scroll' && target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      else if (rule.action === 'navigate' && rule.value) window.location.href = rule.value;
      else if (rule.action === 'open-link' && rule.value) window.open(rule.value, '_blank', 'noopener,noreferrer');
      else if (rule.action === 'play-video') targetList.forEach((el) => {
        const video = el.matches('video') ? el as HTMLVideoElement : el.querySelector('video');
        if (video) void video.play().catch(() => undefined);
      });
      else if (rule.action === 'show-message') setWorkflowNotice(rule.value || rule.name || 'Действие выполнено');
    }
  };
  const handleWorkflowClick = (event: MouseEvent<HTMLDivElement>) => {
    const clicked = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-element-id]');
    runWorkflows('click', clicked?.dataset.elementId || 'any');
  };
  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    touchStartX.current = event.changedTouches[0]?.clientX ?? null;
  };
  const handleTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    if (touchStartX.current === null) return;
    const delta = (event.changedTouches[0]?.clientX ?? touchStartX.current) - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) >= 55) runWorkflows(delta < 0 ? 'swipe-left' : 'swipe-right');
  };
  useEffect(() => {
    if (!storefrontLoaded) return;
    const frame = window.requestAnimationFrame(() => runWorkflows('page-load'));
    return () => window.cancelAnimationFrame(frame);
  }, [storefrontLoaded]);
  useEffect(() => {
    if (!workflowNotice) return;
    const timer = window.setTimeout(() => setWorkflowNotice(''), 3200);
    return () => window.clearTimeout(timer);
  }, [workflowNotice]);
  useEffect(() => { const root = document.documentElement; root.style.setProperty('--site-background', storefront.theme.background); root.style.setProperty('--site-text', storefront.theme.text); root.style.setProperty('--site-accent', storefront.theme.accent); root.style.setProperty('--site-accent-text', storefront.theme.accentText); root.style.setProperty('--site-card-background', storefront.theme.cardBackground); root.style.setProperty('--site-gradient', storefront.theme.gradient); root.style.setProperty('--site-font', '"' + storefront.theme.font + '", sans-serif'); root.style.setProperty('--site-heading-font', '"' + storefront.theme.headingFont + '", serif'); root.style.setProperty('--site-card-radius', storefront.theme.cardRadius + 'px'); root.style.setProperty('--site-card-columns', String(storefront.theme.cardColumns)); root.style.setProperty('--site-image-ratio', storefront.theme.imageRatio); root.style.setProperty('--site-animation-duration', storefront.theme.animationDuration + 'ms'); root.dataset.siteAnimation = storefront.theme.animation; root.dataset.colorAnimation = String(storefront.theme.colorAnimation); root.dataset.siteHeroLayout = storefront.theme.heroLayout || 'split'; }, [storefront]);
  useEffect(() => { document.title = storefront.content.siteName || 'Магазин'; }, [storefront.content.siteName]);
  const summaryQuery = useGetStoreSummary();
  const products = useMemo(() => productsQuery.data ?? [], [productsQuery.data]);
  useEffect(() => {
    const syncProductFromUrl = () => {
      const slug = new URL(window.location.href).searchParams.get('product');
      setSelectedProduct(slug ? products.find((item) => item.slug === slug) ?? null : null);
    };
    syncProductFromUrl();
    window.addEventListener('popstate', syncProductFromUrl);
    return () => window.removeEventListener('popstate', syncProductFromUrl);
  }, [products]);
  const openProduct = (product: Product) => {
    const url = new URL(window.location.href);
    url.searchParams.set('product', product.slug);
    window.history.pushState({ productSlug: product.slug }, '', url.toString());
    setSelectedProduct(product);
  };
  const closeProduct = () => {
    if (window.history.state && typeof window.history.state === 'object' && 'productSlug' in window.history.state) {
      window.history.back();
      return;
    }
    setSelectedProduct(null);
    const url = new URL(window.location.href);
    url.searchParams.delete('product');
    window.history.replaceState({}, '', url.pathname + url.search + url.hash);
  };
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

  return <div className="shop-shell" onClickCapture={handleWorkflowClick} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
    <div style={{ display: storefront.sections.header ? undefined : 'none' }}><ShopHeader count={count} onCart={() => setCartOpen(true)} announcement={storefront.content.announcement} content={storefront.content} /></div>
    <main style={{ display: 'flex', flexDirection: 'column' }}>
      <section className="hero" data-site-section="hero" data-element-id="hero" data-layout={storefront.theme.heroLayout || 'split'} style={{ display: storefront.sections.hero ? undefined : 'none', order: Math.max(0, storefront.sectionOrder.indexOf('hero')) }}>
        <div className="hero-copy">
          <span className="eyebrow">{storefront.content.heroEyebrow}</span>
          <h1>{storefront.content.heroTitle.split("\n").map((line, i) => <Fragment key={i}>{i > 0 && <br />}{line}</Fragment>)}</h1>
          <p>{storefront.content.heroText}</p>
          <a className="cta" href={normalizeSourceUrl(storefront.content.heroButtonUrl || '#catalog')} data-element-id="hero-button" data-testid="link-explore-catalog">{storefront.content.heroButtonText} <ArrowDownRight size={16} /></a>
        </div>
        <div className="hero-art">
          <span className="hero-index">{storefront.content.heroIndexText}</span>
          <a className="hero-image-link" data-element-id="hero-image" href={normalizeSourceUrl(storefront.content.heroImageLink || '#catalog')}><img src={normalizeSourceUrl(storefront.content.heroImage || featured?.imageUrl || '/images/orbit-vase.png')} alt={featured?.name || 'Керамическая ваза в солнечном свете'} /></a>
          <span className="hero-note">{storefront.content.heroNote}</span>
        </div>
      </section>
      <div className="ticker" data-site-section="ticker" data-element-id="ticker" style={{ display: storefront.sections.ticker ? undefined : 'none', order: Math.max(0, storefront.sectionOrder.indexOf('ticker')) }}><span>{storefront.content.ticker1}</span><span>•</span><span>{storefront.content.ticker2}</span><span>•</span><span>{storefront.content.ticker3}</span></div>
      <section className="catalog" id="catalog" data-site-section="catalog" data-element-id="catalog" style={{ display: storefront.sections.catalog ? undefined : 'none', order: Math.max(0, storefront.sectionOrder.indexOf('catalog')) }}>
        <div className="section-head">
          <div><span className="eyebrow">{storefront.content.catalogEyebrow}</span><h2>{storefront.content.catalogTitle.split("\n").map((line, i) => <Fragment key={i}>{i > 0 && <br />}{line}</Fragment>)}</h2></div>
          <div className="catalog-tools">
            <label style={{ position: 'relative' }}><Search size={15} style={{ position: 'absolute', left: 11, top: 11, color: '#829086' }} />
              <input className="search-field" style={{ paddingLeft: 34 }} placeholder={storefront.content.searchPlaceholder} value={search} onChange={(event) => setSearch(event.target.value)} data-testid="input-product-search" />
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
            products.length ? <div className="product-grid">{products.map((product, index) => <ProductCard key={product.id} product={product} index={index} onAdd={addProduct} onOpen={openProduct} />)}</div> :
              <div className="empty-state" data-testid="empty-products">Коллекция пока собирается.<br /><span style={{ fontSize: 13 }}>Загляните чуть позже — здесь появятся новые находки.</span></div>}
      </section>
      <div data-site-section="custom" data-element-id="custom-section" style={{ display: storefront.sections.custom ? undefined : 'none', order: Math.max(0, storefront.sectionOrder.indexOf('custom')) }}><StorefrontBlocks blocks={storefront.blocks} /></div>
      <section className="story-band" id="about" data-site-section="story" data-element-id="about" style={{ display: storefront.sections.story ? undefined : 'none', order: Math.max(0, storefront.sectionOrder.indexOf('story')) }}>
        <div className="story-inner">
          <div><span className="eyebrow">{storefront.content.storyEyebrow}</span><h2>{storefront.content.storyTitle.split("\n").map((line, i) => <Fragment key={i}>{i > 0 && <br />}{line}</Fragment>)}</h2><p>{storefront.content.storyText}</p><a className="quiet-link" href={storefront.content.storyLinkUrl || '#catalog'} data-element-id="story-link" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 9, fontSize: 12 }}>{storefront.content.storyLinkText} <ArrowRight size={14} /></a></div>
          <div className="story-mark">{storefront.content.storyQuote}</div>
        </div>
      </section>
    </main>
    <footer className="footer" data-site-section="footer" data-element-id="footer" style={{ display: storefront.sections.footer ? undefined : 'none' }}><Link href="/" className="brand" data-element-id="footer-brand">{storefront.content.siteName}<small>{storefront.content.siteTagline}</small></Link><div className="footer-note">{storefront.content.footerLocation}<br />{storefront.content.footerNote}</div><span className="mono" style={{ fontSize: 9 }}>© {new Date().getFullYear()} {storefront.content.copyrightLabel}</span></footer>
    {selectedProduct && <ProductDetailModal product={selectedProduct} onClose={closeProduct} onAdd={addProduct} />}
    {cartOpen && <CartDrawer items={cart} onClose={() => setCartOpen(false)} onQty={changeQty} onRemove={removeItem} onOrderSubmitted={() => setCart([])} />}
    {workflowNotice && <div className="workflow-toast" role="status">{workflowNotice}</div>}
  </div>;
}

type ProductDraft = {
  name: string; slug: string; category: string; description: string; price: string; imageUrl: string;
  badge: string; isFeatured: boolean; isActive: boolean;
};
const blankDraft: ProductDraft = { name: '', slug: '', category: '', description: '', price: '', imageUrl: '', badge: '', isFeatured: false, isActive: true };
function ProductEditor({ product, onClose, onSave, busy, onUploadMedia }: { product: Product | null; onClose: () => void; onSave: (data: ProductDraft) => void; busy: boolean; onUploadMedia: (file: File) => Promise<string> }) {
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [draft, setDraft] = useState<ProductDraft>(product ? {
    name: product.name, slug: product.slug, category: product.category, description: product.description,
    price: String(product.price), imageUrl: product.imageUrl, badge: product.badge || '',
    isFeatured: product.isFeatured, isActive: product.isActive,
  } : blankDraft);
  const change = (key: keyof ProductDraft, value: string | boolean) => setDraft((current) => ({ ...current, [key]: value }));
  async function chooseProductImage(file?: File) { if (!file) return; setUploadingMedia(true); try { change('imageUrl', await onUploadMedia(file)); } catch (error) { window.alert(error instanceof Error ? error.message : 'Не удалось загрузить файл'); } finally { setUploadingMedia(false); } }
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
        <label className="form-field full">Ссылка на фотографию<input value={draft.imageUrl} onChange={(e) => change('imageUrl', e.target.value)} data-testid="input-product-image" /><input aria-label="Загрузить фото товара из галереи" type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" disabled={uploadingMedia} onChange={(e) => { void chooseProductImage(e.target.files?.[0]); e.currentTarget.value = ''; }} />{uploadingMedia && <small>Загружаем фото…</small>}</label>
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
  useEffect(() => { fetch('/api/storefront/settings').then((r) => r.json()).then((data) => setConfig({ ...defaultStorefront, ...data, theme: { ...defaultStorefront.theme, ...(data.theme || {}) }, adminTheme: { ...defaultStorefront.adminTheme, ...(data.adminTheme || {}) }, sections: { ...defaultStorefront.sections, ...(data.sections || {}) }, sectionOrder: Array.isArray(data.sectionOrder) ? data.sectionOrder : defaultStorefront.sectionOrder, content: { ...defaultStorefront.content, ...(data.content || {}) }, blocks: Array.isArray(data.blocks) ? data.blocks : [], workflows: Array.isArray(data.workflows) ? data.workflows : [] })).catch(() => setError('Не удалось загрузить настройки')).finally(() => setLoading(false)); }, []);
  const updateTheme = (key: keyof StorefrontConfig['theme'], value: string | number | boolean) => setConfig((c) => ({ ...c, theme: { ...c.theme, [key]: value } }));
  const updateContent = (key: keyof StorefrontConfig['content'], value: string) => setConfig((c) => ({ ...c, content: { ...c.content, [key]: value } }));
  const updateAdminTheme = (key: keyof AdminTheme, value: string | number) => setConfig((c) => ({ ...c, adminTheme: { ...c.adminTheme, [key]: value } }));
  const updateSection = (key: keyof StorefrontConfig['sections'], value: boolean) => setConfig((c) => ({ ...c, sections: { ...c.sections, [key]: value } }));
  function moveSection(index: number, direction: number) { setConfig((c) => { const sectionOrder = [...c.sectionOrder]; const target = index + direction; if (target < 0 || target >= sectionOrder.length) return c; [sectionOrder[index], sectionOrder[target]] = [sectionOrder[target], sectionOrder[index]]; return { ...c, sectionOrder }; }); }
  async function uploadMedia(file: File): Promise<string> { if (file.size > 25 * 1024 * 1024) throw new Error('Максимальный размер файла — 25 МБ.'); const token = await getToken(); const response = await fetch('/api/admin/media?filename=' + encodeURIComponent(file.name), { method: 'POST', headers: { 'Content-Type': file.type, ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: file }); const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Не удалось загрузить медиа'); return body.url as string; }
  async function uploadHeroImage(file?: File) { if (!file) return; try { updateContent('heroImage', await uploadMedia(file)); } catch (error) { setError(error instanceof Error ? error.message : 'Не удалось загрузить изображение'); } }
  async function uploadBlockMedia(index: number, file?: File) { if (!file) return; try { updateBlock(index, 'mediaUrl', await uploadMedia(file)); } catch (error) { setError(error instanceof Error ? error.message : 'Не удалось загрузить медиа'); } }
  const updateBlock = (index: number, key: keyof StorefrontBlock, value: string | number | boolean) => setConfig((c) => ({ ...c, blocks: c.blocks.map((b, i) => i === index ? { ...b, [key]: value } : b) }));
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
    setConfig((c) => ({ ...c, blocks: [...c.blocks, { id: 'block-' + Date.now(), type, title: type === 'text' ? 'Новый блок' : type === 'map' ? 'Карта 2ГИС' : '', text: '', label: type === 'button' ? 'Открыть ссылку' : '', url: '', mediaUrl: '', background: '#f5f1e8', color: '#244c43', width: '100%', animation: 'fade', columns: 12, height: 'auto', fontSize: '16px', titleSize: 'inherit', padding: '22px', radius: 0, textAlign: 'left', objectFit: 'contain', targetBlank: false }] }));
  }
  function moveBlock(index: number, direction: number) {
    setConfig((c) => { const blocks = [...c.blocks]; const target = index + direction; if (target < 0 || target >= blocks.length) return c; const temp = blocks[index]; blocks[index] = blocks[target]; blocks[target] = temp; return { ...c, blocks }; });
  }
  function addWorkflow() {
    setConfig((c) => ({ ...c, workflows: [...(c.workflows || []), { id: 'flow-' + Date.now(), name: 'Новое правило', enabled: true, trigger: 'click', listenOn: 'any', condition: 'always', conditionValue: '', action: 'show-message', targetId: '', value: 'Сработало!' }] }));
  }
  function updateWorkflow(index: number, key: keyof WorkflowRule, value: string | boolean) {
    setConfig((c) => ({ ...c, workflows: c.workflows.map((rule, i) => i === index ? { ...rule, [key]: value } : rule) }));
  }
  function moveWorkflow(index: number, direction: number) {
    setConfig((c) => { const workflows = [...c.workflows]; const target = index + direction; if (target < 0 || target >= workflows.length) return c; [workflows[index], workflows[target]] = [workflows[target], workflows[index]]; return { ...c, workflows }; });
  }
  if (loading) return <div className="skeleton" style={{ height: 220 }} />;
  return <section className="visual-editor">
    <div className="visual-editor-heading"><div><span className="eyebrow">Редактор сайта</span><h2>Оформление витрины</h2><p>Изменения сохраняются в базе данных и сразу применяются к публичному сайту.</p></div><button className="primary-button" onClick={() => void save()} disabled={saving}>{saving ? 'Сохраняем…' : 'Опубликовать оформление'}</button></div>
    {error && <p className="form-error" role="alert">{error}</p>}{saved && <p className="editor-saved" role="status">Оформление сохранено.</p>}
    <div className="visual-editor-grid">
      <div className="editor-group editor-group-wide"><h3>Название сайта и текст всей страницы</h3><p className="editor-help">Здесь меняется текст от шапки до самого низа сайта. Предпросмотр обновляется сразу.</p><div className="editor-block-fields">
<label className="form-field">Название сайта<input value={config.content.siteName} onChange={e => updateContent('siteName', e.target.value)} /></label>
<label className="form-field">Подпись под названием<input value={config.content.siteTagline} onChange={e => updateContent('siteTagline', e.target.value)} /></label>
<label className="form-field">Пункт меню «Каталог»<input value={config.content.navCatalogLabel} onChange={e => updateContent('navCatalogLabel', e.target.value)} /></label>
<label className="form-field">Пункт меню «О нас»<input value={config.content.navAboutLabel} onChange={e => updateContent('navAboutLabel', e.target.value)} /></label>
<label className="form-field">Текст корзины<input value={config.content.cartLabel} onChange={e => updateContent('cartLabel', e.target.value)} /></label>
<label className="form-field">Текст кнопки входа<input value={config.content.signInLabel} onChange={e => updateContent('signInLabel', e.target.value)} /></label>
<label className="form-field">Верхняя строка / объявление<input value={config.content.announcement} onChange={e => updateContent('announcement', e.target.value)} /></label>
<label className="form-field">Бегущая строка — текст 1<input value={config.content.ticker1} onChange={e => updateContent('ticker1', e.target.value)} /></label>
<label className="form-field">Бегущая строка — текст 2<input value={config.content.ticker2} onChange={e => updateContent('ticker2', e.target.value)} /></label>
<label className="form-field">Бегущая строка — текст 3<input value={config.content.ticker3} onChange={e => updateContent('ticker3', e.target.value)} /></label>
<label className="form-field">Надзаголовок каталога<input value={config.content.catalogEyebrow} onChange={e => updateContent('catalogEyebrow', e.target.value)} /></label>
<label className="form-field">Заголовок каталога<textarea rows={2} value={config.content.catalogTitle} onChange={e => updateContent('catalogTitle', e.target.value)} /></label>
<label className="form-field">Подсказка поиска<input value={config.content.searchPlaceholder} onChange={e => updateContent('searchPlaceholder', e.target.value)} /></label>
<label className="form-field">Надзаголовок «О нас»<input value={config.content.storyEyebrow} onChange={e => updateContent('storyEyebrow', e.target.value)} /></label>
<label className="form-field">Цитата внизу страницы<textarea rows={2} value={config.content.storyQuote} onChange={e => updateContent('storyQuote', e.target.value)} /></label>
<label className="form-field">Текст ссылки «О нас»<input value={config.content.storyLinkText} onChange={e => updateContent('storyLinkText', e.target.value)} /></label>
<label className="form-field">Ссылка «О нас»<input value={config.content.storyLinkUrl} onChange={e => updateContent('storyLinkUrl', e.target.value)} /></label>
<label className="form-field">Подвал — город / адрес<input value={config.content.footerLocation} onChange={e => updateContent('footerLocation', e.target.value)} /></label>
<label className="form-field">Подвал — описание<input value={config.content.footerNote} onChange={e => updateContent('footerNote', e.target.value)} /></label>
<label className="form-field">Подпись авторского права<input value={config.content.copyrightLabel} onChange={e => updateContent('copyrightLabel', e.target.value)} /></label>
</div></div>
<div className="editor-group"><h3>Цвета и шрифты</h3><label className="form-field">Фон сайта<input type="color" value={config.theme.background} onChange={e => updateTheme('background', e.target.value)} /></label><label className="form-field">Цвет текста<input type="color" value={config.theme.text} onChange={e => updateTheme('text', e.target.value)} /></label><label className="form-field">Основной цвет / кнопки<input type="color" value={config.theme.accent} onChange={e => updateTheme('accent', e.target.value)} /></label><label className="form-field">Цвет текста кнопок<input type="color" value={config.theme.accentText} onChange={e => updateTheme('accentText', e.target.value)} /></label><label className="form-field">Фон карточек<input type="color" value={config.theme.cardBackground} onChange={e => updateTheme('cardBackground', e.target.value)} /></label><label className="form-field">Градиент CSS<input value={config.theme.gradient} onChange={e => updateTheme('gradient', e.target.value)} placeholder="linear-gradient(...)" /></label><label className="form-field">Шрифт текста<select value={config.theme.font} onChange={e => updateTheme('font', e.target.value)}><option>DM Sans</option><option>Arial</option><option>Georgia</option><option>Inter</option><option>system-ui</option></select></label><label className="form-field">Шрифт заголовков<select value={config.theme.headingFont} onChange={e => updateTheme('headingFont', e.target.value)}><option>Cormorant Garamond</option><option>Georgia</option><option>Arial</option><option>DM Sans</option></select></label></div>
      <div className="editor-group"><h3>Сетка и анимации</h3><label className="form-field">Колонки каталога<select value={config.theme.cardColumns} onChange={e => updateTheme('cardColumns', Number(e.target.value))}><option value={2}>2 колонки</option><option value={3}>3 колонки</option><option value={4}>4 колонки</option><option value={5}>5 колонок</option></select></label><label className="form-field">Схема главного экрана<select value={config.theme.heroLayout || 'split'} onChange={e => updateTheme('heroLayout', e.target.value)}><option value="split">Текст слева, фото справа</option><option value="image-left">Фото слева, текст справа</option><option value="centered">По центру</option></select></label><label className="form-field">Пропорции фото<select value={config.theme.imageRatio} onChange={e => updateTheme('imageRatio', e.target.value)}><option value="1 / 1">Квадрат 1:1</option><option value="4 / 5">Портрет 4:5</option><option value="3 / 2">Альбом 3:2</option><option value="16 / 9">Широкий 16:9</option></select></label><label className="form-field">Скругление карточек (px)<input type="number" min="0" max="40" value={config.theme.cardRadius} onChange={e => updateTheme('cardRadius', Number(e.target.value))} /></label><label className="form-field">Анимация<select value={config.theme.animation} onChange={e => updateTheme('animation', e.target.value)}><option value="lift">Подъём при наведении</option><option value="fade">Плавное появление</option><option value="glow">Свечение</option><option value="none">Без анимации</option></select></label><label className="form-field">Длительность (мс)<input type="number" min="0" max="2000" step="50" value={config.theme.animationDuration} onChange={e => updateTheme('animationDuration', Number(e.target.value))} /></label><label className="editor-check"><input type="checkbox" checked={config.theme.colorAnimation} onChange={e => updateTheme('colorAnimation', e.target.checked)} /> Анимировать цветовые переходы</label></div>
      <div className="editor-group editor-group-wide"><h3>Тексты, изображения и ссылки</h3><label className="form-field">Надзаголовок главного экрана<input value={config.content.heroEyebrow} onChange={e => updateContent('heroEyebrow', e.target.value)} /></label><label className="form-field">Заголовок (перенос строки через Enter)<textarea rows={2} value={config.content.heroTitle} onChange={e => updateContent('heroTitle', e.target.value)} /></label><label className="form-field">Описание главного экрана<textarea rows={3} value={config.content.heroText} onChange={e => updateContent('heroText', e.target.value)} /></label><label className="form-field">Текст кнопки<input value={config.content.heroButtonText} onChange={e => updateContent('heroButtonText', e.target.value)} /></label><label className="form-field">Ссылка кнопки<input value={config.content.heroButtonUrl} onChange={e => updateContent('heroButtonUrl', e.target.value)} placeholder="#catalog или https://..." /></label><label className="form-field">Метка над фото<input value={config.content.heroIndexText} onChange={e => updateContent('heroIndexText', e.target.value)} /></label><label className="form-field">Подпись под фото<input value={config.content.heroNote} onChange={e => updateContent('heroNote', e.target.value)} /></label><label className="form-field">URL картинки главного экрана<input value={config.content.heroImage} onChange={e => updateContent('heroImage', e.target.value)} onBlur={e => updateContent('heroImage', normalizeSourceUrl(e.target.value))} placeholder="site.com/photo.jpg — https:// необязателен" /><input aria-label="Загрузить изображение главного экрана из галереи" type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" onChange={e => { void uploadHeroImage(e.target.files?.[0]); e.currentTarget.value = ''; }} /></label><label className="form-field">Ссылка при нажатии на картинку<input value={config.content.heroImageLink} onChange={e => updateContent('heroImageLink', e.target.value)} placeholder="https://... или #catalog" /></label><label className="form-field">Заголовок блока «О нас»<textarea rows={2} value={config.content.storyTitle} onChange={e => updateContent('storyTitle', e.target.value)} /></label><label className="form-field">Текст «О нас»<textarea rows={3} value={config.content.storyText} onChange={e => updateContent('storyText', e.target.value)} /></label></div>
    </div>
    <div className="editor-group editor-group-wide"><div className="editor-blocks-heading"><div><h3>Свободные блоки страницы</h3><p>Меняйте порядок, размер, цвет, текст, медиа и ссылку каждого блока.</p></div><div className="editor-add-blocks">{(['text','image','video','audio','button','embed','map'] as StorefrontBlock['type'][]).map(type => <button key={type} className="secondary-button" onClick={() => addBlock(type)}>+ {({text:'Текст',image:'Фото',video:'Видео',audio:'Аудио',button:'Кнопка',embed:'YouTube / Telegram',map:'Карта 2ГИС'} as Record<string,string>)[type]}</button>)}</div></div>
      {config.blocks.map((block, index) => <div className="editor-block" key={block.id}><div className="editor-block-top"><strong>{index + 1}. {block.type}</strong><div><button className="plain-icon" onClick={() => moveBlock(index, -1)} disabled={index === 0} aria-label="Переместить выше"><ChevronUp size={16}/></button><button className="plain-icon" onClick={() => moveBlock(index, 1)} disabled={index === config.blocks.length - 1} aria-label="Переместить ниже"><ChevronDown size={16}/></button><button className="plain-icon" onClick={() => setConfig(c => ({...c, blocks:c.blocks.filter((_,i)=>i!==index)}))} aria-label="Удалить блок"><Trash2 size={15}/></button></div></div>
        <div className="editor-block-fields">
          <label className="form-field">Заголовок / подпись<input value={block.title || ''} onChange={e => updateBlock(index, 'title', e.target.value)} /></label>
          {block.type === 'text' && <label className="form-field">Текст<textarea rows={3} value={block.text || ''} onChange={e => updateBlock(index, 'text', e.target.value)} /></label>}
          {block.type === 'button' && <label className="form-field">Текст кнопки<input value={block.label || ''} onChange={e => updateBlock(index, 'label', e.target.value)} /></label>}
          {(['image', 'video', 'audio', 'embed', 'map'] as string[]).includes(block.type) && <label className="form-field">URL медиа / встраивания<input value={block.mediaUrl || ''} onChange={e => updateBlock(index, 'mediaUrl', e.target.value)} onBlur={e => updateBlock(index, 'mediaUrl', normalizeSourceUrl(e.target.value))} placeholder={block.type === 'map' ? 'Ссылка на виджет / карту 2ГИС' : 'site.com/file.mp4 — https необязателен'} />{(['image', 'video', 'audio'] as string[]).includes(block.type) && <input aria-label="Выбрать медиа из галереи" type="file" accept={block.type === 'image' ? 'image/*' : block.type === 'video' ? 'video/mp4,video/webm,video/quicktime' : 'audio/mpeg,audio/mp4,audio/ogg,audio/wav,audio/webm'} onChange={e => { void uploadBlockMedia(index, e.target.files?.[0]); e.currentTarget.value = ''; }} />}</label>}
          <label className="form-field">Ссылка при нажатии<input value={block.url || ''} onChange={e => updateBlock(index, 'url', e.target.value)} onBlur={e => updateBlock(index, 'url', normalizeSourceUrl(e.target.value))} placeholder="example.com или #catalog" /></label>
          <label className="form-field">Фон / градиент<input value={block.background || ''} onChange={e => updateBlock(index, 'background', e.target.value)} placeholder="#ffffff или linear-gradient(...)" /></label>
          <label className="form-field">Цвет текста<input value={block.color || ''} onChange={e => updateBlock(index, 'color', e.target.value)} placeholder="#244c43" /></label>
          <label className="form-field">Ширина внутри сетки<input value={block.width || '100%'} onChange={e => updateBlock(index, 'width', e.target.value)} placeholder="100%, 50%, 600px" /></label>
          <label className="form-field">Размер сетки<select value={block.columns ?? 12} onChange={e => updateBlock(index, 'columns', Number(e.target.value))}><option value={12}>Во всю ширину</option><option value={8}>2/3 строки</option><option value={6}>Половина</option><option value={4}>1/3 строки</option><option value={3}>1/4 строки</option></select></label>
          <label className="form-field">Высота / минимум<input value={block.height || 'auto'} onChange={e => updateBlock(index, 'height', e.target.value)} placeholder="auto, 260px, 40vh" /></label>
          <label className="form-field">Размер текста<input value={block.fontSize || '16px'} onChange={e => updateBlock(index, 'fontSize', e.target.value)} placeholder="16px, 1.2rem" /></label>
          {block.type === 'text' && <label className="form-field">Размер заголовка<input value={block.titleSize || 'inherit'} onChange={e => updateBlock(index, 'titleSize', e.target.value)} placeholder="inherit, 32px, 2rem" /></label>}
          <label className="form-field">Внутренние отступы<input value={block.padding || '22px'} onChange={e => updateBlock(index, 'padding', e.target.value)} placeholder="22px, 2rem" /></label>
          <label className="form-field">Скругление (px)<input type="number" min="0" max="48" value={block.radius ?? 0} onChange={e => updateBlock(index, 'radius', Number(e.target.value))} /></label>
          <label className="form-field">Выравнивание текста<select value={block.textAlign || 'left'} onChange={e => updateBlock(index, 'textAlign', e.target.value)}><option value="left">Слева</option><option value="center">По центру</option><option value="right">Справа</option></select></label>
          <label className="form-field">Анимация блока<select value={block.animation || 'fade'} onChange={e => updateBlock(index, 'animation', e.target.value)}><option value="fade">Появление</option><option value="lift">Подъём</option><option value="glow">Свечение</option><option value="float">Плавное движение</option><option value="none">Без анимации</option></select></label>
          {(['image', 'video'] as string[]).includes(block.type) && <label className="form-field">Вписывание медиа<select value={block.objectFit || 'contain'} onChange={e => updateBlock(index, 'objectFit', e.target.value)}><option value="contain">Вписать целиком</option><option value="cover">Заполнить блок</option></select></label>}
          <label className="editor-check"><input type="checkbox" checked={block.targetBlank ?? false} onChange={e => updateBlock(index, 'targetBlank', e.target.checked)} /> Открывать ссылку в новой вкладке</label>
        </div>
      </div>)}
      {!config.blocks.length && <p className="editor-empty">Пока нет блоков. Добавьте текст, картинку, видео, аудио или кнопку выше.</p>}
      <div className="editor-group editor-group-wide puzzle-workspace">
        <div className="editor-blocks-heading"><div><h3>Конструктор действий — как пазлы</h3><p>Собери цепочку: <b>КОГДА</b> событие → <b>ЕСЛИ</b> условие → <b>ТО</b> действие. Правила сохраняются и работают на опубликованном сайте.</p></div><button className="primary-button" onClick={addWorkflow}>+ Добавить правило</button></div>
        <div className="puzzle-examples"><span>КОГДА пользователь нажал</span><span>КОГДА свайпнул влево / вправо</span><span>ЕСЛИ условие верно</span><span>ТО показать фото / анимацию / ссылку / видео</span></div>
        {config.workflows.map((rule, index) => <article className="puzzle-rule" key={rule.id}>
          <div className="puzzle-rule-head"><div><span className="puzzle-number">{String(index + 1).padStart(2, '0')}</span><input aria-label="Название правила" value={rule.name} onChange={e => updateWorkflow(index, 'name', e.target.value)} /></div><div className="puzzle-rule-actions"><label className="editor-check"><input type="checkbox" checked={rule.enabled} onChange={e => updateWorkflow(index, 'enabled', e.target.checked)} /> Включено</label><button className="plain-icon" onClick={() => moveWorkflow(index, -1)} disabled={index === 0} aria-label="Правило выше"><ChevronUp size={16}/></button><button className="plain-icon" onClick={() => moveWorkflow(index, 1)} disabled={index === config.workflows.length - 1} aria-label="Правило ниже"><ChevronDown size={16}/></button><button className="plain-icon" onClick={() => setConfig(c => ({...c, workflows:c.workflows.filter((_,i)=>i!==index)}))} aria-label="Удалить правило"><Trash2 size={15}/></button></div></div>
          <div className="puzzle-chain">
            <section className="puzzle-piece puzzle-trigger"><span>1 · КОГДА</span><strong>Событие</strong><select value={rule.trigger} onChange={e => updateWorkflow(index, 'trigger', e.target.value)}><option value="page-load">Страница открылась</option><option value="click">Пользователь нажал</option><option value="swipe-left">Свайп влево</option><option value="swipe-right">Свайп вправо</option></select>{rule.trigger === 'click' && <label className="form-field">Где нажали<select value={rule.listenOn} onChange={e => updateWorkflow(index, 'listenOn', e.target.value)}><option value="any">В любом месте</option><option value="hero">Главный экран</option><option value="hero-button">Кнопка главного экрана</option><option value="hero-image">Фото главного экрана</option><option value="catalog">Каталог</option><option value="product-card">Карточка товара</option><option value="about">Блок «О нас»</option><option value="footer">Подвал сайта</option><option value="cart-toggle">Кнопка корзины</option>{config.blocks.map(b => <option key={b.id} value={b.id}>Блок: {b.title || b.id}</option>)}</select></label>}</section>
            <div className="puzzle-connector">↓</div>
            <section className="puzzle-piece puzzle-condition"><span>2 · ЕСЛИ</span><strong>Условие</strong><select value={rule.condition} onChange={e => updateWorkflow(index, 'condition', e.target.value)}><option value="always">Всегда</option><option value="mobile">На телефоне</option><option value="desktop">На компьютере</option><option value="cart-has-items">В корзине есть товар</option><option value="url-contains">Адрес страницы содержит…</option></select>{rule.condition === 'url-contains' && <input placeholder="например, ?promo=1" value={rule.conditionValue || ''} onChange={e => updateWorkflow(index, 'conditionValue', e.target.value)} />}</section>
            <div className="puzzle-connector">↓</div>
            <section className="puzzle-piece puzzle-action"><span>3 · ТО</span><strong>Действие</strong><select value={rule.action} onChange={e => updateWorkflow(index, 'action', e.target.value)}><option value="show">Показать элемент</option><option value="hide">Скрыть элемент</option><option value="toggle">Переключить видимость</option><option value="animate">Запустить анимацию</option><option value="scroll">Прокрутить к элементу</option><option value="play-video">Воспроизвести видео</option><option value="navigate">Перейти по ссылке</option><option value="open-link">Открыть ссылку в новой вкладке</option><option value="show-message">Показать сообщение</option></select>{(['show','hide','toggle','animate','scroll','play-video'] as WorkflowAction[]).includes(rule.action) && <label className="form-field">Целевой элемент<select value={rule.targetId || ''} onChange={e => updateWorkflow(index, 'targetId', e.target.value)}><option value="">Выбрать элемент…</option><option value="hero">Главный экран</option><option value="hero-image">Фото главного экрана</option><option value="hero-button">Кнопка главного экрана</option><option value="ticker">Бегущая строка</option><option value="catalog">Каталог</option><option value="product-card">Карточка товара</option><option value="about">Блок «О нас»</option><option value="story-link">Ссылка «О нас»</option><option value="footer">Подвал сайта</option><option value="cart-toggle">Кнопка корзины</option><option value="cart-panel">Корзина (когда открыта)</option>{config.blocks.map(b => <option key={b.id} value={b.id}>Блок: {b.title || b.id}</option>)}</select></label>}{rule.action === 'animate' && <label className="form-field">Анимация<select value={rule.value || 'pulse'} onChange={e => updateWorkflow(index, 'value', e.target.value)}><option value="pulse">Пульс</option><option value="shake">Покачивание</option><option value="bounce">Прыжок</option><option value="glow">Свечение</option><option value="fade">Появление</option></select></label>}{(['navigate','open-link','show-message'] as WorkflowAction[]).includes(rule.action) && <label className="form-field">{rule.action === 'show-message' ? 'Текст сообщения' : 'URL / адрес'}<input value={rule.value || ''} onChange={e => updateWorkflow(index, 'value', e.target.value)} placeholder={rule.action === 'show-message' ? 'Готово!' : 'https://... или #catalog'} /></label>}</section>
          </div>
          <div className="puzzle-rule-foot"><span>{rule.enabled ? '● Правило включено' : '○ Правило выключено'}</span><span>Правила выполняются сверху вниз.</span></div>
        </article>)}
        {!config.workflows.length && <div className="editor-empty">Пример: «Когда нажали на кнопку → если открыт на телефоне → прокрутить к каталогу».</div>}
      </div>
      <div className="editor-group editor-group-wide"><h3>Управление секциями и порядком</h3><p className="editor-help">Отключи любую секцию или спрячь шапку и подвал. Если выключить всё — публичная страница станет пустой.</p><div className="section-toggle-grid">{([{key:'header',label:'Шапка сайта'},{key:'hero',label:'Главный экран'},{key:'ticker',label:'Бегущая строка'},{key:'catalog',label:'Каталог товаров'},{key:'custom',label:'Пользовательские блоки'},{key:'story',label:'Блок «О нас»'},{key:'footer',label:'Подвал'}] as {key:keyof StorefrontConfig['sections'];label:string}[]).map(item => <label className="editor-check" key={item.key}><input type="checkbox" checked={config.sections[item.key]} onChange={e => updateSection(item.key,e.target.checked)} />{item.label}</label>)}</div><h4>Порядок секций</h4><div className="section-order-list">{config.sectionOrder.map((key,index) => <div className="section-order-item" key={key}><strong>{index+1}. {({hero:'Главный экран',ticker:'Бегущая строка',catalog:'Каталог',custom:'Свободные блоки',story:'О нас'} as Record<SectionKey,string>)[key]}</strong><div><button className="plain-icon" disabled={index===0} onClick={() => moveSection(index,-1)} aria-label="Секция выше"><ChevronUp size={15}/></button><button className="plain-icon" disabled={index===config.sectionOrder.length-1} onClick={() => moveSection(index,1)} aria-label="Секция ниже"><ChevronDown size={15}/></button></div></div>)}</div></div>
      <div className="editor-group editor-group-wide"><h3>Оформление самой админ-панели</h3><p className="editor-help">Эти параметры меняют интерфейс управления, а не публичную витрину.</p><div className="editor-block-fields"><label className="form-field">Фон админ-панели<input type="color" value={config.adminTheme.background} onChange={e => updateAdminTheme('background',e.target.value)} /></label><label className="form-field">Фон бокового меню<input type="color" value={config.adminTheme.sidebar} onChange={e => updateAdminTheme('sidebar',e.target.value)} /></label><label className="form-field">Акцент / выбранный пункт<input type="color" value={config.adminTheme.accent} onChange={e => updateAdminTheme('accent',e.target.value)} /></label><label className="form-field">Цвет текста<input type="color" value={config.adminTheme.text} onChange={e => updateAdminTheme('text',e.target.value)} /></label><label className="form-field">Фон карточек и таблиц<input type="color" value={config.adminTheme.surface} onChange={e => updateAdminTheme('surface',e.target.value)} /></label><label className="form-field">Шрифт админ-панели<select value={config.adminTheme.font} onChange={e => updateAdminTheme('font',e.target.value)}><option>DM Sans</option><option>Arial</option><option>Georgia</option><option>Inter</option><option>system-ui</option></select></label><label className="form-field">Скругление элементов (px)<input type="number" min="0" max="32" value={config.adminTheme.radius} onChange={e => updateAdminTheme('radius',Number(e.target.value))} /></label></div><div className="admin-theme-sample" style={{background:config.adminTheme.background,color:config.adminTheme.text,fontFamily:config.adminTheme.font,borderRadius:config.adminTheme.radius}}><aside style={{background:config.adminTheme.sidebar,color:'#fff'}}>МЕНЮ · КАТАЛОГ · ЗАКАЗЫ</aside><div style={{background:config.adminTheme.surface,borderRadius:config.adminTheme.radius}}><strong>Предпросмотр админ-панели</strong><p>Карточки, таблицы и настройки</p><button style={{background:config.adminTheme.accent,color:'#fff',borderRadius:config.adminTheme.radius}}>Сохранить изменения</button></div></div></div>
      <div className="editor-live-preview">
        <div className="editor-live-preview-head"><strong>ЖИВОЙ ПРЕДПРОСМОТР</strong><span>Изменяется вместе с настройками выше</span></div>
        <div className="editor-live-preview-store" style={{
          background: config.theme.background,
          color: config.theme.text,
          fontFamily: config.theme.font,
          ['--site-accent' as any]: config.theme.accent,
          ['--site-accent-text' as any]: config.theme.accentText,
          ['--site-card-background' as any]: config.theme.cardBackground,
          ['--site-gradient' as any]: config.theme.gradient,
          ['--site-font' as any]: '"' + config.theme.font + '", sans-serif',
          ['--site-heading-font' as any]: '"' + config.theme.headingFont + '", serif',
          ['--site-card-radius' as any]: String(config.theme.cardRadius) + 'px',
          ['--site-animation-duration' as any]: String(config.theme.animationDuration) + 'ms',
        } as any}>
          <div className="editor-mini-announcement" style={{display:config.sections.header ? undefined : "none"}}>{config.content.announcement}</div><div className="editor-mini-site-head" style={{display:config.sections.header ? undefined : "none"}}><strong>{config.content.siteName}</strong><span>{config.content.navCatalogLabel} · {config.content.navAboutLabel}</span><small>{config.content.siteTagline}</small></div>
          <div className="editor-mini-hero" style={{ background: config.theme.gradient, display: config.sections.hero ? undefined : "none", order: Math.max(0, config.sectionOrder.indexOf("hero")) }}>
            <div><small>{config.content.heroEyebrow}</small><h3 style={{ fontFamily: config.theme.headingFont }}>{config.content.heroTitle.replace(/\n/g, ' ')}</h3><p>{config.content.heroText}</p><span style={{ background: config.theme.accent, color: config.theme.accentText }}>{config.content.heroButtonText}</span></div>
            <div className="editor-mini-product" style={{ background: config.theme.cardBackground, borderRadius: config.theme.cardRadius }}><img src={config.content.heroImage || '/images/orbit-vase.png'} alt="" /><strong>Керамическая ваза</strong><small>12 000 ₸</small></div>
          </div>
          <div className="editor-mini-ticker" style={{display:config.sections.ticker ? undefined : "none",order:Math.max(0,config.sectionOrder.indexOf("ticker"))}}>{config.content.ticker1}　•　{config.content.ticker2}　•　{config.content.ticker3}</div><section className="editor-mini-catalog" style={{display:config.sections.catalog ? undefined : "none",order:Math.max(0,config.sectionOrder.indexOf("catalog"))}}><small>{config.content.catalogEyebrow}</small><h3>{config.content.catalogTitle.replace(/\n/g, " ")}</h3><div className="editor-mini-cards">{[1,2,3].map(n => <div key={n} style={{ background: config.theme.cardBackground, borderRadius: config.theme.cardRadius }}><img src={n === 1 ? config.content.heroImage || "/images/orbit-vase.png" : n === 2 ? "/images/linen-lamp.png" : "/images/terracotta-tray.png"} alt="" /><span>Пример товара {n}</span><small>12 000 ₸</small></div>)}</div></section><div style={{display:config.sections.custom ? undefined : "none",order:Math.max(0,config.sectionOrder.indexOf("custom"))}}><StorefrontBlocks blocks={config.blocks} /></div><section className="editor-mini-story" style={{ background: config.theme.gradient,display:config.sections.story ? undefined : "none",order:Math.max(0,config.sectionOrder.indexOf("story")) }}><small>{config.content.storyEyebrow}</small><h3>{config.content.storyTitle.replace(/\n/g, " ")}</h3><p>{config.content.storyText}</p><blockquote>{config.content.storyQuote}</blockquote></section><footer className="editor-mini-footer" style={{display:config.sections.footer ? undefined : "none"}}><strong>{config.content.siteName}</strong><span>{config.content.footerLocation}</span><span>{config.content.footerNote}</span><small>© {new Date().getFullYear()} {config.content.copyrightLabel}</small></footer>
        </div>
      </div>
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
  async function uploadMedia(file: File): Promise<string> { if (file.size > 25 * 1024 * 1024) throw new Error('Максимальный размер файла — 25 МБ.'); const token = await getToken(); const response = await fetch('/api/admin/media?filename=' + encodeURIComponent(file.name), { method: 'POST', headers: { 'Content-Type': file.type, ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: file }); const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Не удалось загрузить медиа'); return body.url as string; }
  useEffect(() => { let cancelled = false; fetch('/api/storefront/settings').then((response) => response.ok ? response.json() : null).then((data) => { if (cancelled || !data) return; const theme = { ...defaultStorefront.adminTheme, ...(data.adminTheme || {}) }; const root = document.documentElement; root.style.setProperty('--admin-background', theme.background); root.style.setProperty('--admin-sidebar', theme.sidebar); root.style.setProperty('--admin-accent', theme.accent); root.style.setProperty('--admin-text', theme.text); root.style.setProperty('--admin-surface', theme.surface); root.style.setProperty('--admin-font', '"' + theme.font + '", sans-serif'); root.style.setProperty('--admin-radius', theme.radius + 'px'); }).catch(() => undefined); return () => { cancelled = true; }; }, []);
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
    {editor !== undefined && <ProductEditor product={editor} onClose={() => setEditor(undefined)} busy={busy} onUploadMedia={uploadMedia} onSave={(draft) => {
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
