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
 * - Positioning: fixed top-[160px] left-0 right-0 z-30
 * - Styling: text-lg font-normal drop-shadow-lg
 * - Colors: text-white hover:text-white/90 active:text-amber-400
 * - Visibility logic: Only shows on leaf pages via SiteLayout.tsx
 * 
 * Current Behavior: Floats over background image without backdrop
 */
export default function SubNavigation({ items }: SubNavigationProps) {
  const pathname = usePathname();

  return (
    <>
      {/* DESIGN-PROTECTED: Positioning - Enhanced for mobile responsiveness */}
      <div className="fixed top-[160px] md:top-[180px] left-0 right-0 z-30">
        <div className="max-w-5xl mx-auto px-4 md:px-6">
          <div className="py-3 md:py-4">
            {/* DESIGN-PROTECTED: Layout - Enhanced with mobile wrapping and centering */}
            <ul className="flex items-center justify-center flex-wrap gap-2 md:gap-6">
              {items.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <li key={item.href}>
                    {/* DESIGN-PROTECTED: Text styling - Responsive sizing with drop shadow */}
                    <Link
                      href={item.href}
                      className={`text-sm md:text-base lg:text-lg font-normal tracking-wide transition-colors duration-200 drop-shadow-lg px-2 py-1 rounded-md touch-manipulation ${
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
