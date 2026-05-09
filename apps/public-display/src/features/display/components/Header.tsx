import { BrandLogo } from '@pos-tercos/brand';
import { TurnBadgeXL } from '@pos-tercos/ui';

export function Header({ turn }: { turn: number }) {
  return (
    <header className="flex items-start justify-between gap-8 px-[5vw] pt-[3vh]">
      <BrandLogo variant="full" theme="dark" size="h-20 md:h-24" />
      <TurnBadgeXL value={turn} />
    </header>
  );
}
