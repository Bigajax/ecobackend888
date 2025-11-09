import { randomUUID } from "node:crypto";
import { supabaseForGuests } from "../adapters/SupabaseAdapter";
import { persistGuestMessage, ensureGuestSession } from "../services/conversation/guestPersistence";

/**
 * Script para testar a persistência de mensagens de guests
 * Simula um guest chegando e enviando mensagens
 */
async function testGuestPersistence() {
  console.log("🧪 Iniciando teste de persistência de guests...\n");

  try {
    // Criar cliente Supabase para guests
    const supabase = supabaseForGuests();
    console.log("✅ Cliente Supabase para guests criado\n");

    // Gerar um guest_id fake
    const guestId = randomUUID();
    console.log(`📝 Guest ID gerado: ${guestId}\n`);

    // 1. Testar ensureGuestSession
    console.log("1️⃣  Testando ensureGuestSession...");
    await ensureGuestSession({
      supabase,
      guestId,
      ip: "192.168.1.1",
      ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    });
    console.log("✅ Guest session criada/atualizada\n");

    // 2. Testar persistGuestMessage
    console.log("2️⃣  Testando persistGuestMessage...");
    await persistGuestMessage({
      supabase,
      guestId,
      userMessage: "Olá Eco! Como você está?",
      assistantResponse: "Olá! Estou bem, obrigado por perguntar. Como posso ajudá-lo hoje?",
      ip: "192.168.1.1",
      ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    });
    console.log("✅ Mensagens do guest salvas\n");

    // 3. Verificar dados salvos
    console.log("3️⃣  Verificando dados salvos...");
    const { data: sessions, error: sessionError } = await supabase
      .from("guest_sessions")
      .select("*")
      .eq("id", guestId);

    if (sessionError) {
      console.error("❌ Erro ao buscar guest_sessions:", sessionError.message);
    } else {
      console.log("✅ Guest sessions encontradas:", sessions?.length);
      if (sessions?.[0]) {
        console.log("   - ID:", sessions[0].id);
        console.log("   - Created at:", sessions[0].created_at);
        console.log("   - Last seen at:", sessions[0].last_seen_at);
        console.log("   - IP:", sessions[0].ip);
      }
    }
    console.log();

    const { data: messages, error: messageError } = await supabase
      .from("guest_messages")
      .select("*")
      .eq("guest_id", guestId);

    if (messageError) {
      console.error("❌ Erro ao buscar guest_messages:", messageError.message);
    } else {
      console.log("✅ Guest messages encontradas:", messages?.length);
      messages?.forEach((msg, idx) => {
        console.log(`\n   Mensagem ${idx + 1}:`);
        console.log(`   - Role: ${msg.role}`);
        console.log(`   - Text: ${msg.text.substring(0, 50)}...`);
        console.log(`   - Created at: ${msg.created_at}`);
      });
    }
    console.log();

    // 4. Testar múltiplas mensagens
    console.log("4️⃣  Testando múltiplas mensagens...");
    for (let i = 1; i <= 3; i++) {
      await persistGuestMessage({
        supabase,
        guestId,
        userMessage: `Mensagem ${i} do guest`,
        assistantResponse: `Resposta ${i} do assistant`,
      });
      console.log(`   ✅ Mensagem ${i} salva`);
    }
    console.log();

    // 5. Contar total de mensagens
    const { data: allMessages, error: countError } = await supabase
      .from("guest_messages")
      .select("*", { count: "exact" })
      .eq("guest_id", guestId);

    if (countError) {
      console.error("❌ Erro ao contar mensagens:", countError.message);
    } else {
      console.log(`✅ Total de mensagens para este guest: ${allMessages?.length}`);
    }
    console.log();

    console.log("🎉 Teste de persistência de guests COMPLETO!");
  } catch (error) {
    console.error("❌ Erro durante teste:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Executar teste
testGuestPersistence();
