/**
 * The planner's night (red) theme: the localStorage key, and the tiny script the root layout inlines in <head> so `data-theme` is on <html> before first paint (a reload at night never flashes Day).
 * Only /planner is themed: elsewhere the script does nothing. A blocked localStorage throws; the script catches it and the page stays Day.
 */
export const THEME_KEY = 'planner.theme';

export const THEME_SCRIPT = `(function(){try{var p=location.pathname;if((p==='/planner'||p.indexOf('/planner/')===0)&&localStorage.getItem('${THEME_KEY}')==='red'){document.documentElement.setAttribute('data-theme','red');}}catch(e){}})();`;
