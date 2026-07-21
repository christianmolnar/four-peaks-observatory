'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { globalConfig } from '@/config/global';

export default function Navigation() {
  const { navigation } = globalConfig;
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
  };

  // Close mobile menu on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeMobileMenu();
      }
    };

    if (isMobileMenuOpen) {
      document.addEventListener('keydown', handleEscape);
      // Prevent body scroll when menu is open
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isMobileMenuOpen]);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-black/90 backdrop-blur-sm">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        {/* Logo Section */}
        <div className="flex items-center justify-between md:justify-center py-0">
          <Link href="/" className="hover:opacity-80 transition-opacity">
            {/* Observatory Logo */}
            <div
              className="flex items-center justify-center"
              style={{ maxWidth: '520px', width: '100%' }}
            >
              <Image
                src={navigation.logo.src}
                alt={navigation.logo.alt}
                width={navigation.logo.width}
                height={navigation.logo.height}
                className="object-contain w-full h-auto"
                priority
              />
            </div>
          </Link>

          {/* Hamburger Menu Button - Mobile Only */}
          <button
            onClick={toggleMobileMenu}
            className="md:hidden flex flex-col items-center justify-center w-10 h-10 space-y-1.5 hover:opacity-80 transition-opacity"
            aria-label="Toggle mobile menu"
            aria-expanded={isMobileMenuOpen}
          >
            <span 
              className={`block w-6 h-0.5 bg-white transition-all duration-300 ${
                isMobileMenuOpen ? 'rotate-45 translate-y-2' : ''
              }`}
            />
            <span 
              className={`block w-6 h-0.5 bg-white transition-all duration-300 ${
                isMobileMenuOpen ? 'opacity-0' : ''
              }`}
            />
            <span 
              className={`block w-6 h-0.5 bg-white transition-all duration-300 ${
                isMobileMenuOpen ? '-rotate-45 -translate-y-2' : ''
              }`}
            />
          </button>
        </div>

        {/* Centered Dividing Line - Desktop Only */}
        <div className="hidden md:flex justify-center pb-1">
          <div className="w-full max-w-[800px] h-px bg-white"></div>
        </div>

        {/* Desktop Navigation Links */}
        <div className="hidden md:block pb-2">
          <ul className="flex items-center justify-center space-x-8">
            {navigation.items.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="nav-link text-white hover:text-yellow-400 transition-colors duration-200 text-base font-normal tracking-normal"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 z-40 md:hidden"
          style={{ top: '80px' }} // Start below the navigation bar
        >
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={closeMobileMenu}
          />
          
          {/* Menu Panel */}
          <div className="relative bg-black/95 backdrop-blur-md border-t border-white/10">
            <div className="max-w-md mx-auto px-6 py-8">
              <ul className="space-y-6">
                {navigation.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={closeMobileMenu}
                      className="nav-link block text-white hover:text-yellow-400 transition-colors duration-200 text-lg font-normal tracking-normal py-3 px-4 rounded-lg hover:bg-white/5"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
