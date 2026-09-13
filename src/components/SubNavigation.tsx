'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface SubNavItem {
  label: string;
  href: string;
}

interface SubNavigationProps {
  items: SubNavItem[];
}

/**
 * DESIGN-PROTECTED COMPONENT: SubNavigation
 * 
 * DO NOT MODIFY without explicit user permission - see DESIGN_PROTECTION.md
 * 
 * Protected Elements:
 * - Positioning: fixed top-[130px] md:top-[150px] left-0 right-0 z-30
 * - Styling: text-sm font-normal drop-shadow-lg, single line (no wrap)
 * - Colors: text-white hover:text-white/90 active:text-amber-400
 * - Visibility logic: Only shows on leaf pages via SiteLayout.tsx
 * 
 * Current Behavior: Floats over background image without backdrop, fits on one line
 */
export default function SubNavigation({ items }: SubNavigationProps) {
  const pathname = usePathname();

  return (
    <>
      {/* DESIGN-PROTECTED: Positioning - Enhanced for mobile responsiveness */}
      <div className="fixed top-[130px] md:top-[150px] left-0 right-0 z-30">
        <div className="max-w-5xl mx-auto px-4 md:px-6">
          <div className="py-1 md:py-1.5">
            {/* DESIGN-PROTECTED: Layout - Single line, no wrap, smaller than main nav */}
            <ul className="flex items-center justify-center flex-nowrap gap-3 md:gap-6 overflow-x-auto">
              {items.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <li key={item.href} className="shrink-0">
                    {/* DESIGN-PROTECTED: Text styling - Slightly smaller than main nav, single line */}
                    <Link
                      href={item.href}
                      className={`text-xs md:text-sm font-normal tracking-wide whitespace-nowrap transition-colors duration-200 drop-shadow-lg px-2 py-1 rounded-md touch-manipulation ${
                        isActive 
                          ? 'text-amber-400' 
                          : 'text-white hover:text-white/90'
                      }`}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
      {/* DESIGN-PROTECTED: End SubNavigation container */}
    </>
  );
}
