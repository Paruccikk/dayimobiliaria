import { auth } from "./firebase-client.js";
import { createUserWithEmailAndPassword, updateProfile, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
const form=document.querySelector("#cadastro-form");
const feedback=document.querySelector("#cadastro-feedback");
const submitButton=form?.querySelector('button[type="submit"]');
let currentUser=null,submitting=false;
onAuthStateChanged(auth,user=>{currentUser=user});
const messages={"auth/email-already-in-use":"Este e-mail já está cadastrado. Faça login.","auth/invalid-email":"Informe um e-mail válido.","auth/weak-password":"A senha precisa ter pelo menos 6 caracteres.","auth/operation-not-allowed":"Ative E-mail/Senha em Firebase Authentication → Sign-in method.","auth/invalid-api-key":"A chave de configuração do Firebase está incorreta.","auth/network-request-failed":"Falha de conexão. Verifique sua internet."};
function show(text){if(feedback)feedback.textContent=text}
form?.addEventListener("submit",async event=>{event.preventDefault();if(submitting)return;
const value=id=>document.querySelector("#"+id)?.value.trim()||"";
const nome=value("nome"),whatsapp=value("whatsapp"),email=value("email"),password=document.querySelector("#password")?.value||"",confirmation=document.querySelector("#confirm-password")?.value||"";
const consentWhatsapp=document.querySelector("#consent-whatsapp")?.checked===true,consentEmail=document.querySelector("#consent-email")?.checked===true,consentPush=document.querySelector("#consent-push")?.checked===true,aceitouPolitica=document.querySelector("#accept-policy")?.checked===true;
if(!nome||!email||!aceitouPolitica)return show("Informe seu nome, e-mail e aceite a Política de Privacidade.");
if(consentWhatsapp&&whatsapp.replace(/\D/g,"").length<10)return show("Informe um WhatsApp válido para autorizar mensagens por esse canal.");
if(password.length<6)return show("A senha precisa ter pelo menos 6 caracteres.");if(password!==confirmation)return show("As senhas não conferem.");
submitting=true;if(submitButton)submitButton.disabled=true;show(currentUser?"Finalizando cadastro…":"Criando sua conta…");
try{let user=currentUser;if(!user){const credential=await createUserWithEmailAndPassword(auth,email,password);user=credential.user;currentUser=user;await updateProfile(user,{displayName:nome})}else if((user.email||"").toLowerCase()!==email.toLowerCase())throw new Error("Existe uma sessão aberta com outro e-mail. Saia da conta e tente novamente.");
const token=await user.getIdToken(true);
const body={nome,whatsapp,aceitouPolitica,consentimentos:{whatsapp:consentWhatsapp,email:consentEmail,push:consentPush},endereco:{cep:value("cep"),rua:value("rua"),numero:value("numero"),complemento:value("complemento"),bairro:value("bairro"),cidade:value("cidade"),estado:value("estado").toUpperCase()}};
const response=await fetch("/api/auth/registrar",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},body:JSON.stringify(body)});const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.error||"Não foi possível salvar seu perfil.");
await signOut(auth);currentUser=null;form.reset();show("Cadastro concluído! Suas preferências foram salvas. Você já pode navegar pelo site e alterar suas autorizações quando quiser.");
}catch(error){console.error("Falha no cadastro:",error);show(messages[error.code]||error.message||"Não foi possível concluir o cadastro.")}finally{submitting=false;if(submitButton)submitButton.disabled=false}
});
