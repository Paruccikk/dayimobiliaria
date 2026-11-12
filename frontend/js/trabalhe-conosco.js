const form=document.querySelector("#career-form");
const feedback=document.querySelector("#career-feedback");
const submit=form?.querySelector('button[type="submit"]');
form?.addEventListener("submit",async event=>{
  event.preventDefault();
  if(submit)submit.disabled=true;
  if(feedback)feedback.textContent="Enviando sua candidatura…";
  const data=Object.fromEntries(new FormData(form).entries());
  try{
    const response=await fetch("/api/oportunidades-corretor",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});
    const result=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(result.error||"Não foi possível enviar sua candidatura.");
    form.reset();
    if(feedback)feedback.textContent="Candidatura enviada! A equipe da R&D Prime agradece seu interesse.";
  }catch(error){if(feedback)feedback.textContent=error.message;}
  finally{if(submit)submit.disabled=false;}
});