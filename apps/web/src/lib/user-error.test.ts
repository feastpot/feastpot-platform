import { createUserErrorMapper } from '../../../../packages/ui/src/lib/user-error';

describe('safe actionable checkout errors', () => {
  it('renders fixed business guidance, never the provider message, with the original reference', async () => {
    const report = jest.fn();
    const mapper = createUserErrorMapper(report);
    const error = { code: 'SLOT_UNAVAILABLE', message: 'private provider diagnostic' };
    mapper.acknowledge(error, 'FP-ABCD-1234');
    expect(await mapper(error, 'Could not complete checkout.')).toBe(
      'This delivery slot is no longer available Ref: FP-ABCD-1234',
    );
    expect(report).not.toHaveBeenCalled();
  });

  it('keeps unknown codes generic and records their private diagnostic', async () => {
    const report = jest.fn().mockResolvedValue('FP-ABCD-1234');
    const mapper = createUserErrorMapper(report);
    expect(await mapper({ code: 'UNKNOWN', message: 'private detail' }, 'Please try again.')).toBe(
      'Please try again. Ref: FP-ABCD-1234',
    );
    expect(report).toHaveBeenCalledTimes(1);
  });
});
