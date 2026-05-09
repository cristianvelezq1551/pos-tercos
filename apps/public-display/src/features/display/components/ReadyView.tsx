import type { PublicDisplayState } from '@pos-tercos/types';
import { ProductThumbStack } from '@pos-tercos/brand';
import { OrderHero } from '@pos-tercos/ui';
import { NextRail } from './NextRail';

export function ReadyView({
  current,
  next,
}: {
  current: NonNullable<PublicDisplayState['current']>;
  next: PublicDisplayState['next'];
}) {
  return (
    <div className="flex h-full flex-col justify-center gap-10">
      <OrderHero
        receiptNumber={current.receiptNumber}
        customerName={current.customerName}
        tone="ready"
        thumbs={
          current.items.length > 0 ? (
            <ProductThumbStack
              items={current.items}
              size="lg"
              max={4}
              layout="grid"
              eager
            />
          ) : null
        }
      />
      <NextRail next={next} />
    </div>
  );
}
