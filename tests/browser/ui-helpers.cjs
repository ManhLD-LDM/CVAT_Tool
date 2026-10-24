// Follow the same task navigation/details path as a person using the HUD.
async function reveal(page,id){
 const target=page.locator('#'+id),panel=target.locator('xpath=ancestor::*[@role="tabpanel"]');
 if(await panel.count()){
  const name=(await panel.getAttribute('id')).replace('c3d-task-','');
  await page.locator('[data-task="'+name+'"]').click();
 }
 const ancestors=await target.locator('xpath=ancestor::details').all();
 for(const detail of ancestors)if(!await detail.evaluate(n=>n.open))await detail.locator(':scope > summary').click();
}
module.exports={reveal};
