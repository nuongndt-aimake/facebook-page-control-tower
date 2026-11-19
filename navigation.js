(()=>{
 const navFor=node=>node?.closest?.('#quick-nav');
 const setGroup=(group,open)=>{group.classList.toggle('group-open',open);group.querySelector('.quick-menu-group-toggle')?.setAttribute('aria-expanded',String(open))};
 const closeGroups=nav=>nav?.querySelectorAll('.quick-menu-group').forEach(group=>setGroup(group,false));
 const setPanel=(nav,open)=>{nav.classList.toggle('menu-open',open);nav.querySelector('.quick-menu-toggle')?.setAttribute('aria-expanded',String(open));if(!open)closeGroups(nav)};
 const openGroup=group=>{const nav=navFor(group);closeGroups(nav);setGroup(group,true)};
 document.addEventListener('click',event=>{
   const nav=navFor(event.target),panel=event.target.closest?.('.quick-menu-toggle'),toggle=event.target.closest?.('.quick-menu-group-toggle');
   if(panel){setPanel(nav,!nav.classList.contains('menu-open'));return}
   if(toggle){const group=toggle.closest('.quick-menu-group'),open=!group.classList.contains('group-open');closeGroups(nav);setGroup(group,open);return}
   if(event.target.closest?.('.quick-menu-links a')){setPanel(nav,false);return}
   if(!nav)document.querySelectorAll('#quick-nav').forEach(item=>setPanel(item,false));
 });
 document.addEventListener('pointerover',event=>{if(!matchMedia('(min-width:901px) and (hover:hover) and (pointer:fine)').matches)return;const group=event.target.closest?.('.quick-menu-group');if(!group||!group.querySelector('.quick-menu-submenu')||group.contains(event.relatedTarget))return;openGroup(group)});
 document.addEventListener('pointerout',event=>{if(!matchMedia('(min-width:901px) and (hover:hover) and (pointer:fine)').matches)return;const group=event.target.closest?.('.quick-menu-group');if(group&&!group.contains(event.relatedTarget)&&!group.contains(document.activeElement))setGroup(group,false)});
 document.addEventListener('keydown',event=>{
   const nav=navFor(event.target);if(!nav)return;
   if(event.key==='Escape'){event.preventDefault();const group=event.target.closest('.quick-menu-group');setPanel(nav,false);(group?.querySelector('.quick-menu-group-toggle')||nav.querySelector('.quick-menu-toggle'))?.focus();return}
   if(event.key==='ArrowDown'&&event.target.matches('.quick-menu-group-toggle')){event.preventDefault();const group=event.target.closest('.quick-menu-group');openGroup(group);group.querySelector('.quick-menu-submenu a')?.focus()}
 });
 document.addEventListener('focusout',event=>{const nav=navFor(event.target);if(nav)setTimeout(()=>{if(!nav.contains(document.activeElement))setPanel(nav,false)},0)});
 window.addEventListener('resize',()=>document.querySelectorAll('#quick-nav').forEach(nav=>setPanel(nav,false)));
})();
