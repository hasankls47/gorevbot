const { Client, GatewayIntentBits, Collection, Events, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, MessageFlags } = require('discord.js');
const { token, dagitimKanalId, onayRedKanalId, arsivYetkiliRolId, gorevdatalog, sahiprol, menuKullaniciRolId, komutYetkiliRolId } = require('./config.json');
const fs = require('node:fs');
const path = require('node:path');
const db = require('croxydb');
const { gorevListeleri: tumGorevListeleri, groupTasksByTime } = require('./gorev-tanimlari.js');

db.setReadable(true);
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
    }
}

client.once(Events.ClientReady, async c => {
    console.log(`${c.user.tag} olarak giriş yapıldı!`);
});

async function logAction(client, title, description, color) {
    try {
        const logChannel = await client.channels.fetch(gorevdatalog);
        const logEmbed = new EmbedBuilder().setTitle(title).setDescription(description).setColor(color).setTimestamp();
        await logChannel.send({ embeds: [logEmbed] });
    } catch (error) {
        console.error("Log kanalına mesaj gönderilemedi:", error);
    }
}

async function updateDagitimMesaji(client, db, aktifGorevListesi) {
    const mesajId = db.get('dagitim_mesaj_id');
    if (!mesajId) return;
    try {
        const dagitimKanali = await client.channels.fetch(dagitimKanalId);
        const dagitimMesajiToEdit = await dagitimKanali.messages.fetch(mesajId);
        const aktifTip = db.get('aktif_gorev_tipi') || 'varsayilan';
        const tipIsimleri = { haftaici: "Hafta İçi", haftasonu: "Hafta Sonu", pazar: "Pazar", varsayilan: "Varsayılan" };
        const aktifTipIsmi = tipIsimleri[aktifTip] || "Bilinmeyen";

        const groupedTasks = groupTasksByTime(aktifGorevListesi);
        const fields = Object.entries(groupedTasks).map(([time, tasks]) => {
            const value = tasks.map(task => {
                const gorevData = db.get(`gorev_${task.key}`);
                const roleName = task.label.substring(time.length + 1);
                let durum;
                if (!gorevData) { durum = '▫️ **Boşta**'; }
                else if (gorevData.status === 'pending') { durum = `⏳ **Beklemede** (<@${gorevData.requestedBy}>)`; }
                else { durum = `✅ <@${gorevData.takenBy}>`; }
                return `**${roleName}**: ${durum}`;
            }).join('\n');
            // --- DEĞİŞİKLİK BURADA ---
            return { name: `⏰ ${time} Görevleri`, value: value, inline: true };
        });

        const updatedEmbed = new EmbedBuilder()
            .setTitle(`Görev Dağılım Listesi (${aktifTipIsmi})`)
            .setColor("Blue")
            .setFields(fields)
            .setTimestamp();
        
        const menuOptions = aktifGorevListesi.filter(g => !db.has(`gorev_${g.key}`)).map(g => new StringSelectMenuOptionBuilder().setLabel(g.label).setValue(g.key).setDescription(g.description));
        let newComponents = [];
        if (menuOptions.length > 0) {
            const selectMenu = new StringSelectMenuBuilder().setCustomId('gorev_secim_menu').setPlaceholder('Almak istediğiniz görevleri seçin...').setMinValues(1).setMaxValues(menuOptions.length).addOptions(menuOptions);
            newComponents.push(new ActionRowBuilder().addComponents(selectMenu));
        }
        if (db.has('arsiv') && db.get('arsiv')?.length > 0) {
            newComponents.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('eski_gorevleri_goster').setLabel('Geçmiş Dağılımları Göster').setStyle(ButtonStyle.Secondary)));
        }
        await dagitimMesajiToEdit.edit({ embeds: [updatedEmbed], components: newComponents });
    } catch (error) {
        console.error("Dağıtım mesajı güncellenirken bir hata oluştu:", error.message);
        if (error.code === 10008) {
            console.log("Geçersiz 'dagitim_mesaj_id' veritabanından temizlendi.");
            db.delete('dagitim_mesaj_id');
        }
    }
}

client.on(Events.InteractionCreate, async interaction => {
    const aktifTip = db.get('aktif_gorev_tipi') || 'varsayilan';
    const aktifGorevListesi = tumGorevListeleri[aktifTip];
    const state = { db, aktifTip, aktifGorevListesi, tumGorevListeleri, dagitimKanalId, logAction };

    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;
        try { await command.execute(interaction, state); } catch (error) { console.error(error); }
    } 
    else if (interaction.isStringSelectMenu()) {
        if (interaction.customId === 'gorev_secim_menu') {
            await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
            const user = interaction.user;

            const hasPermission = (rolId) => interaction.user.id === sahiprol || interaction.member.roles.cache.has(rolId);
            if (!hasPermission(menuKullaniciRolId)) { return interaction.reply({ content: 'Görev alabilmek için gerekli role sahip değilsiniz.', flags: [MessageFlags.Ephemeral] }); }
         
            const secilenGorevler = interaction.values;
            if (db.has(`talep_${user.id}`)) { return interaction.editReply({ content: 'Zaten onay bekleyen bir görev talebiniz var.' }); }
            secilenGorevler.forEach(gorevKey => { db.set(`gorev_${gorevKey}`, { status: 'pending', requestedBy: user.id }); });
            db.set(`talep_${user.id}`, secilenGorevler);
            await updateDagitimMesaji(client, db, aktifGorevListesi);
            const gorevEtiketleri = secilenGorevler.map(val => aktifGorevListesi.find(g => g.key === val)?.label || val).join('\n');
            const dmEmbed = new EmbedBuilder().setTitle('✅ Görev Talebin Alındı').setDescription('...').setColor('Green').addFields({ name: 'Talep Ettiğin Görevler', value: `\`\`\`\n- ${gorevEtiketleri}\n\`\`\`` }).setTimestamp();
            const onayKanali = await client.channels.fetch(onayRedKanalId);
            const onayEmbed = new EmbedBuilder().setTitle('📝 Yeni Görev Talebi').setDescription(`${user} (${user.tag}) adlı kullanıcı şu görevleri talep etti:\n- ${gorevEtiketleri.replace(/\n/g, '\n- ')}`).setColor('Yellow').setTimestamp();
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`onayla_${user.id}`).setLabel('Onayla').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`reddet_${user.id}`).setLabel('Reddet').setStyle(ButtonStyle.Danger));
            try { await user.send({ embeds: [dmEmbed] }); } catch (error) { console.log(`${user.tag} kullanıcısının DM'leri kapalı.`); }
            await onayKanali.send({ embeds: [onayEmbed], components: [row] });
            await logAction(client, "Yeni Görev Talebi", `${user} şu görevleri talep etti:\n- ${gorevEtiketleri.replace(/\n/g, '\n- ')}`, "Yellow");
            await interaction.editReply({ content: 'Görev talebin yetkililere iletildi ve dağıtım listesi güncellendi!' });
        }

         if (interaction.customId.startsWith('gorev_sil_menu_')) {
            const targetUserId = interaction.customId.split('_')[3];
            const gorevlerToSil = interaction.values; // Silinmek için seçilen görev key'leri

            // Seçilen görevleri veritabanından sil
            gorevlerToSil.forEach(gorevKey => {
                db.delete(`gorev_${gorevKey}`);
            });

            // Ana dağıtım mesajını güncelle
            await updateDagitimMesaji(client, db, aktifGorevListesi);

            // Loglama işlemi
            const targetUser = await client.users.fetch(targetUserId);
            const silinenGorevEtiketleri = gorevlerToSil.map(val => aktifGorevListesi.find(g => g.key === val)?.label || val).join('\n- ');
            await logAction(client, "Görev Silindi", `${interaction.user}, **${targetUser.tag}** kullanıcısının şu görevlerini sildi:\n- ${silinenGorevEtiketleri}`, "Red");

            // Yetkiliye işlemi onaylayan bir mesaj gönder ve menüyü kaldır
            await interaction.update({
                content: `**${targetUser.tag}** adlı kullanıcının seçilen görevleri başarıyla silindi ve liste güncellendi.`,
                components: [] // Menüyü mesajdan kaldırır
            });
        }
    
    }
    else if (interaction.isButton()) {
        const hasPermission = (rolId) => interaction.user.id === sahiprol || interaction.member.roles.cache.has(rolId);
        if (interaction.customId.startsWith('eski_gorevleri_goster') || interaction.customId.startsWith('arsiv_')) {
            if (!hasPermission(arsivYetkiliRolId)) { return interaction.reply({ content: 'Bu bilgiyi görüntülemek için yetkiniz yok.', flags: [MessageFlags.Ephemeral] }); }
         
            const arsivler = db.get('arsiv') || [];
            if (arsivler.length === 0) { return interaction.reply({ content: 'Görüntülenecek geçmiş dağılım kaydı bulunamadı.', flags: [MessageFlags.Ephemeral] }); }
            let page = 0;
            if (interaction.customId.startsWith('arsiv_')) { const parts = interaction.customId.split('_'); const action = parts[1]; let currentPage = parseInt(parts[2], 10); if (action === 'geri') { page = currentPage - 1; } else { page = currentPage + 1; } } else { page = arsivler.length - 1; }
            if (page < 0) page = 0; if (page >= arsivler.length) page = arsivler.length - 1;
            const arsivKaydi = arsivler[page]; const timestamp = new Date(arsivKaydi.timestamp).toLocaleString('tr-TR', { dateStyle: 'long', timeStyle: 'short' });
            const description = arsivKaydi.gorevler.map(g => `**${g.label}**: <@${g.takenBy}>`).join('\n');
            const archiveEmbed = new EmbedBuilder().setTitle(`Geçmiş Dağılım (${page + 1}/${arsivler.length})`).setDescription(description).setColor('Grey').setFooter({ text: `Sıfırlanma Tarihi: ${timestamp}` });
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`arsiv_geri_${page}`).setLabel('◀️ Geri').setStyle(ButtonStyle.Primary).setDisabled(page === 0), new ButtonBuilder().setCustomId(`arsiv_ileri_${page}`).setLabel('İleri ▶️').setStyle(ButtonStyle.Primary).setDisabled(page >= arsivler.length - 1));
            if (interaction.customId.startsWith('arsiv_')) { return interaction.update({ embeds: [archiveEmbed], components: [row] }); }
            return interaction.reply({ embeds: [archiveEmbed], components: [row], flags: [MessageFlags.Ephemeral] });
        }
        await interaction.deferUpdate();
        const [action, targetUserId] = interaction.customId.split('_');
        if (!hasPermission(komutYetkiliRolId)) { return; }
        const talepEdilenGorevler = db.get(`talep_${targetUserId}`);
        const targetUser = await client.users.fetch(targetUserId).catch(() => null);
        if (!talepEdilenGorevler || !targetUser) {
            const disabledButtons = new ActionRowBuilder().addComponents(interaction.message.components[0].components.map(c => ButtonBuilder.from(c).setDisabled(true)));
            return interaction.editReply({ content: 'Bu talep artık geçerli değil (Sistem sıfırlanmış veya bot yeniden başlatılmış olabilir).', components: [disabledButtons] });
        }
        const originalEmbed = interaction.message.embeds[0];
        const gorevEtiketleri = talepEdilenGorevler.map(val => aktifGorevListesi.find(g => g.key === val)?.label || val).join('\n- ');
        if (action === 'onayla') {
            const disabledButtons = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`onayla_${targetUserId}`).setLabel('Onaylandı').setStyle(ButtonStyle.Success).setDisabled(true));
            talepEdilenGorevler.forEach(gorevKey => { db.set(`gorev_${gorevKey}`, { status: 'taken', takenBy: targetUserId, date: new Date().toISOString() }); });
            db.delete(`talep_${targetUserId}`);
            await updateDagitimMesaji(client, db, aktifGorevListesi);
            await interaction.editReply({ content: `Talep, ${interaction.user} tarafından **onaylandı**.`, embeds: [originalEmbed], components: [disabledButtons] });
            await logAction(client, "Görev Onaylandı", `${interaction.user}, ${targetUser.tag} kullanıcısının şu görev talebini onayladı:\n- ${gorevEtiketleri}`, "Green");
            await targetUser.send('Seçtiğiniz görevler onaylandı!').catch(() => {});
        } else if (action === 'reddet') {
            const disabledButtons = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`reddet_${targetUserId}`).setLabel('Reddedildi').setStyle(ButtonStyle.Danger).setDisabled(true));
            talepEdilenGorevler.forEach(gorevKey => { db.delete(`gorev_${gorevKey}`); });
            db.delete(`talep_${targetUserId}`);
            await updateDagitimMesaji(client, db, aktifGorevListesi);
            await interaction.editReply({ content: `Talep, ${interaction.user} tarafından **reddedildi**.`, embeds: [originalEmbed], components: [disabledButtons] });
            await logAction(client, "Görev Reddedildi", `${interaction.user}, ${targetUser.tag} kullanıcısının şu görev talebini reddetti:\n- ${gorevEtiketleri}`, "Red");
            await targetUser.send('Seçtiğiniz görevler maalesef reddedildi.').catch(() => {});
        }
    }
});

client.login(token);