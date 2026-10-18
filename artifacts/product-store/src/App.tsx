import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, useAuth, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { ruRU } from '@clerk/localizations';
import { shadcn } from '@clerk/themes';
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
  ArrowDownRight, ArrowRight, Leaf, Minus, Package, Pencil,
  Plus, Search, ShoppingBag, Trash2, X,
} from 'lucide-react';
import { Link, Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import './index.css';

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
if (!clerkPubKey) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');

function stripBase(path: string) {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
}

const clerkAppearance = {
  theme: shadcn,
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
  const { isLoaded, isSignedIn } = useAuth();
  const overview = useGetAdminOverview({
    query: {
      queryKey: getGetAdminOverviewQueryKey(),
      enabled: isLoaded && isSignedIn === true,
      retry: false,
      staleTime: 30_000,
    },
  });
  if (!overview.data) return null;
  return <Link className="quiet-link" href="/admin" data-testid="link-admin-panel">Панель управления</Link>;
}

function ShopHeader({ count, onCart }: { count: number; onCart: () => void }) {
  return <>
    <div className="announcement">Доставка по Казахстану · бесплатно от 35 000 ₸</div>
    <header className="header">
      <Link href="/" className="brand" data-testid="link-home">тихо.<small>дом и повседневность</small></Link>
      <nav className="header-links" aria-label="Главная навигация">
        <a className="quiet-link" href="#catalog">Каталог</a>
        <a className="quiet-link" href="#about">О нас</a>
        <AdminHeaderLink />
        <Link className="quiet-link" href="/sign-in" data-testid="link-sign-in">Войти</Link>
        <button className="icon-button" onClick={onCart} data-testid="button-open-cart" aria-label="Открыть корзину">
          <ShoppingBag size={18} strokeWidth={1.5} /><span>Корзина</span><span className="cart-count" data-testid="text-cart-count">{count}</span>
        </button>
      </nav>
    </header>
  </>;
}

function ProductCard({ product, index, onAdd }: { product: Product; index: number; onAdd: (product: Product) => void }) {
  return <article className="product-card" data-testid={`card-product-${product.id}`}>
    <div className="product-photo">
      <img src={productImage(product, index)} alt={product.name} loading="lazy" data-testid={`img-product-${product.id}`} />
      {product.badge && <span className="badge">{product.badge}</span>}
      <button className="quick-add" onClick={() => onAdd(product)} aria-label={`Добавить ${product.name}`} data-testid={`button-add-product-${product.id}`}>
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

function CartDrawer({ items, onClose, onQty, onRemove }: {
  items: CartItem[];
  onClose: () => void;
  onQty: (id: number, delta: number) => void;
  onRemove: (id: number) => void;
}) {
  const total = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  return <div className="drawer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <aside className="cart-drawer" role="dialog" aria-modal="true" aria-label="Корзина">
      <div className="drawer-head"><h2>Ваша корзина</h2><button className="plain-icon" onClick={onClose} aria-label="Закрыть корзину" data-testid="button-close-cart"><X /></button></div>
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
        <p className="checkout-note">Корзина сохранена на этом устройстве. Условия заказа и доставки уточняются.</p>
      </>}
    </aside>
  </div>;
}

function Catalog() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [cartOpen, setCartOpen] = useState(false);
  const [cart, setCart] = useState<CartItem[]>(() => {
    try { return restoreCart(localStorage.getItem('tihoshop-cart')); } catch { return []; }
  });
  const listParams = useMemo(() => ({ ...(search.trim() ? { search: search.trim() } : {}), ...(category ? { category } : {}) }), [search, category]);
  const productsQuery = useListProducts(listParams);
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
    <ShopHeader count={count} onCart={() => setCartOpen(true)} />
    <main>
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">Маленькая коллекция для дома</span>
          <h1>Жить<br />чуть тише.</h1>
          <p>Вещи, которые не требуют внимания — только становятся частью хорошего дня. Собираем их небольшими партиями.</p>
          <a className="cta" href="#catalog" data-testid="link-explore-catalog">Смотреть коллекцию <ArrowDownRight size={16} /></a>
        </div>
        <div className="hero-art">
          <span className="hero-index">ПРЕДМЕТЫ С ХАРАКТЕРОМ · № 01</span>
          <img src={featured?.imageUrl || '/images/orbit-vase.png'} alt={featured?.name || 'Керамическая ваза в солнечном свете'} />
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
            products.length ? <div className="product-grid">{products.map((product, index) => <ProductCard key={product.id} product={product} index={index} onAdd={addProduct} />)}</div> :
              <div className="empty-state" data-testid="empty-products">Коллекция пока собирается.<br /><span style={{ fontSize: 13 }}>Загляните чуть позже — здесь появятся новые находки.</span></div>}
      </section>
      <section className="story-band" id="about">
        <div className="story-inner">
          <div><span className="eyebrow">Небольшое объяснение</span><h2>Не больше.<br />Лучше.</h2><p>«Тихо» — маленький магазин вещей, которые приятно держать рядом. Мы не гонимся за количеством и выбираем предметы так, как выбирали бы для собственного дома.</p><a className="quiet-link" href="#catalog" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 9, fontSize: 12 }}>Вернуться к вещам <ArrowRight size={14} /></a></div>
          <div className="story-mark">«Хорошая вещь не заполняет пространство — она делает его вашим»</div>
        </div>
      </section>
    </main>
    <footer className="footer"><Link href="/" className="brand">тихо.<small>дом и повседневность</small></Link><div className="footer-note">Алматы · Казахстан<br />Корзина хранится на устройстве</div><span className="mono" style={{ fontSize: 9 }}>© {new Date().getFullYear()} ТИХО</span></footer>
    {cartOpen && <CartDrawer items={cart} onClose={() => setCartOpen(false)} onQty={changeQty} onRemove={removeItem} />}
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

function AdminGate() {
  const overviewQuery = useGetAdminOverview();
  const productsQuery = useListAdminProducts();
  const [activeView, setActiveView] = useState<'overview' | 'products'>('overview');
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
  const isLoading = overviewQuery.isLoading || productsQuery.isLoading;
  const isError = overviewQuery.isError || productsQuery.isError;
  const overview = overviewQuery.data;
  const adminProducts = productsQuery.data ?? [];
  const visibleProducts = adminProducts.filter((product) => `${product.name} ${product.category}`.toLocaleLowerCase().includes(filter.toLocaleLowerCase()));
  const busy = create.isPending || update.isPending;

  if (isLoading) return <div className="admin-layout"><div className="admin-sidebar"><span className="brand">тихо.<small>управление</small></span></div><div className="admin-main"><div className="admin-content"><div className="skeleton" style={{ height: 60, marginBottom: 28 }} /><div className="stat-grid">{[1, 2, 3, 4].map((i) => <div key={i} className="skeleton" style={{ height: 120 }} />)}</div><div className="skeleton" style={{ height: 260 }} /></div></div></div>;
  if (isError || !overview) return <div className="admin-layout"><div className="gate-card">
    <span className="eyebrow">Закрытый раздел</span>
    <h1>Вход в магазин</h1>
    <p>После входа через Google панель откроется только для подтверждённого email из списка администратора. Если вы видите этот экран после входа, проверьте, что выбран правильный Google-аккаунт.</p>
    <Link className="cta" href="/sign-in" data-testid="link-admin-sign-in">Войти в аккаунт <ArrowRight size={15} /></Link>
    <button className="secondary-button" style={{ marginLeft: 8 }} onClick={() => { void overviewQuery.refetch(); void productsQuery.refetch(); }} data-testid="button-retry-admin">Проверить доступ</button>
    <div style={{ marginTop: 17 }}><Link className="quiet-link" href="/" data-testid="link-return-store">Вернуться в магазин</Link></div>
  </div></div>;

  return <div className="admin-layout">
    <aside className="admin-sidebar">
      <Link className="brand" href="/" data-testid="link-admin-home">тихо.<small>управление</small></Link>
      <div><div className="admin-label">Рабочее пространство</div><nav className="admin-nav">
        <button className={activeView === 'overview' ? 'selected' : ''} onClick={() => setActiveView('overview')} data-testid="button-admin-overview"><Leaf size={16} />Обзор</button>
        <button className={activeView === 'products' ? 'selected' : ''} onClick={() => setActiveView('products')} data-testid="button-admin-products"><Package size={16} />Предметы</button>
      </nav></div>
      <div><div className="admin-label">Публичный магазин</div><Link className="quiet-link" style={{ color: '#d7dfd3', fontSize: 12, padding: 12, display: 'flex', alignItems: 'center', gap: 9 }} href="/" data-testid="link-view-store">Открыть витрину <ArrowRight size={13} /></Link></div>
    </aside>
    <main className="admin-main"><div className="admin-content">
      <div className="admin-top">
        <div><div className="eyebrow">Тихо · администрирование</div><h1>{activeView === 'overview' ? 'Обзор магазина' : 'Каталог предметов'}</h1></div>
        <button className="primary-button" onClick={() => setEditor(null)} data-testid="button-create-product"><Plus size={15} /> Новый предмет</button>
      </div>
      {notice && <p role="status" style={{ color: '#486d53', fontSize: 12 }} data-testid="status-admin-notice">{notice}<button className="plain-icon" onClick={() => setNotice('')} aria-label="Закрыть сообщение"><X size={13} /></button></p>}
      {activeView === 'overview' ? <>
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
    <div className="auth-form-area"><div className="clerk-auth-card"><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} forceRedirectUrl={`${basePath}/admin`} /></div></div></div>;
}
function BrandedSignUp() {
  return <div className="auth-page"><aside className="auth-side"><Link href="/" className="brand" style={{ color: '#f7f2e8' }}>тихо.<small>дом и повседневность</small></Link><div><span className="eyebrow" style={{ color: '#d6a08d' }}>В хорошей компании</span><h1>Меньше шума. Больше любимых вещей.</h1><p>Создайте аккаунт для нашей небольшой команды и бережно собирайте каталог.</p></div><span className="mono" style={{ fontSize: 9, letterSpacing: '.12em' }}>АЛМАТЫ · КАЗАХСТАН</span></aside>
    <div className="auth-form-area"><div className="clerk-auth-card"><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} forceRedirectUrl={`${basePath}/admin`} /></div></div></div>;
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
