// Stand-in for next/navigation: the sections render outside the app router.
export const useRouter = () => ({ push: () => {}, replace: () => {}, refresh: () => {}, back: () => {}, prefetch: () => {} });
export const usePathname = () => '/dashboard';
export const useSearchParams = () => new URLSearchParams();
export const redirect = () => {};
export const notFound = () => {};
