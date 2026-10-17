import { usePostcodeUrlSync } from './use-postcode-url-sync';

const mockReplace = jest.fn();
const mockSetResolved = jest.fn();
const mockRouter = { replace: mockReplace };
const mockRef = { current: false };
let mockPathname = '/vendors';
let mockParams = new URLSearchParams();

jest.mock('react', () => ({
  ...jest.requireActual('react'),
  useEffect: (effect: () => void) => effect(),
  useRef: () => mockRef,
  useState: (initial: boolean) => [initial, mockSetResolved],
}));
jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useSearchParams: () => mockParams,
  useRouter: () => mockRouter,
}));
jest.mock('@/lib/postcode', () => ({
  readStoredPostcode: jest.fn(() => 'SE15 4ST'),
  writeStoredPostcode: jest.fn(),
  writeCoverageCookie: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockRef.current = false;
  mockPathname = '/vendors';
  mockParams = new URLSearchParams();
});

test('restores the saved postcode on initial browse entry', () => {
  usePostcodeUrlSync(undefined);
  expect(mockReplace).toHaveBeenCalledWith('/vendors?postcode=SE15+4ST', { scroll: false });
});

test('disappearing search params during vendor navigation never restore the listing URL', () => {
  mockParams = new URLSearchParams('postcode=SE15+4ST');
  usePostcodeUrlSync('SE15 4ST');
  mockParams = new URLSearchParams();
  usePostcodeUrlSync(undefined);
  expect(mockReplace).not.toHaveBeenCalled();
  mockPathname = '/vendors/fixture-kitchen';
  usePostcodeUrlSync(undefined);
  expect(mockReplace).not.toHaveBeenCalled();
});

test('never restores a postcode into a non-listing destination', () => {
  mockPathname = '/vendors/fixture-kitchen';
  usePostcodeUrlSync(undefined);
  expect(mockReplace).not.toHaveBeenCalled();
});
