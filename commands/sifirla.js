const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { gorevListeleri: tumGorevListeleri, groupTasksByTime } = require('../gorev-tanimlari.js');
const { sahiprol, komutYetkiliRolId, dagitimKanalId } = require('../config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('sıfırla')
        .setDescription('Yeni bir görev listesi seçerek mevcut dağılımı sıfırlar ve arşivler.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(option =>
            option.setName('tip').setDescription('Hangi görev listesinin aktif olacağını seçin.').setRequired(true)
                .addChoices(
                    { name: 'Hafta İçi', value: 'haftaici' },
                    { name: 'Hafta Sonu (Cuma-Cts)', value: 'haftasonu' },
                    { name: 'Pazar', value: 'pazar' },
                    { name: 'Varsayılan', value: 'varsayilan' }
                )),
    async execute(interaction, state) {
        const { db, aktifGorevListesi, logAction } = state;
        const hasPermission = (rolId) => interaction.user.id === sahiprol || interaction.member.roles.cache.has(rolId);
        if (!hasPermission(komutYetkiliRolId)) {
            return interaction.reply({ content: 'Bu komutu kullanmak için yetkiniz yok.', flags: [MessageFlags.Ephemeral] });
        }
        
        const secilenTip = interaction.options.getString('tip');
        const eskiGorevler = [];
        if (aktifGorevListesi) { aktifGorevListesi.forEach(g => { const gorevData = db.get(`gorev_${g.key}`); if (gorevData && gorevData.status === 'taken') { eskiGorevler.push({ label: g.label, takenBy: gorevData.takenBy }); } }); }
        if (eskiGorevler.length > 0) { const yeniArsivKaydi = { timestamp: new Date().toISOString(), gorevler: eskiGorevler }; db.push('arsiv', yeniArsivKaydi); let arsivler = db.get('arsiv') || []; if (arsivler.length > 10) { db.set('arsiv', arsivler.slice(-10)); } }

        Object.values(tumGorevListeleri).flat().filter(Boolean).forEach(g => { if(g && g.key) db.delete(`gorev_${g.key}`); });
        Object.keys(db.all()).filter(key => key.startsWith('talep_')).forEach(key => db.delete(key));
        db.set('aktif_gorev_tipi', secilenTip);
        
        const yeniGorevListesi = tumGorevListeleri[secilenTip];
        const mesajId = db.get('dagitim_mesaj_id');
        
        if (mesajId) {
            try {
                const dagitimKanali = await interaction.guild.channels.fetch(dagitimKanalId);
                const dagitimMesajiToEdit = await dagitimKanali.messages.fetch(mesajId);
                const tipEtiketi = interaction.options.get('tip').name;

                const groupedTasks = groupTasksByTime(yeniGorevListesi);
                const fields = Object.entries(groupedTasks).map(([time, tasks]) => {
                    const value = tasks.map(task => {
                        const roleName = task.label.substring(time.length + 1);
                        return `**${roleName}**: ▫️ **Boşta**`;
                    }).join('\n');
                    // --- DEĞİŞİKLİK BURADA ---
                    return { name: `⏰ ${time} Görevleri`, value: value, inline: true };
                });

                const embed = new EmbedBuilder()
                    .setTitle(`Görev Dağılım Listesi (${tipEtiketi} - Sıfırlandı)`)
                    .setColor('Blue')
                    .setFields(fields)
                    .setTimestamp();
                
                const menuOptions = yeniGorevListesi.filter(Boolean).map(g => new StringSelectMenuOptionBuilder().setLabel(g.label).setValue(g.key).setDescription(g.description));
                const selectMenu = new StringSelectMenuBuilder().setCustomId('gorev_secim_menu').setPlaceholder('Almak istediğiniz görevleri seçin...').setMinValues(1).setMaxValues(menuOptions.length).addOptions(menuOptions);
                const menuRow = new ActionRowBuilder().addComponents(selectMenu);
                const components = [menuRow];
                if (db.has('arsiv') && db.get('arsiv')?.length > 0) { components.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('eski_gorevleri_goster').setLabel('Geçmiş Dağılımları Göster').setStyle(ButtonStyle.Secondary))); }
                
                await dagitimMesajiToEdit.edit({ embeds: [embed], components });
                await logAction(interaction.client, "Görev Listesi Sıfırlandı", `**${interaction.user.tag}** tarafından **${tipEtiketi}** görev listesi seçildi ve dağılım sıfırlandı.`, "Orange");
                
                await interaction.reply({ content: `**${tipEtiketi}** görev listesi başarıyla ayarlandı, dağılım sıfırlandı ve mesaj güncellendi!`, flags: [MessageFlags.Ephemeral] });
            } catch (error) {
                if (error.code === 10008) {
                    db.delete('dagitim_mesaj_id');
                    await interaction.reply({ content: 'Görevler sıfırlandı ancak dağılım mesajı kanalda bulunamadı. Lütfen `/dağılım` komutunu tekrar kullanın.', flags: [MessageFlags.Ephemeral] });
                } else {
                    console.error("Dağıtım mesajı güncellenemedi:", error);
                    await interaction.reply({ content: 'Görevler sıfırlandı ancak dağılım mesajı güncellenirken bir hata oluştu.', flags: [MessageFlags.Ephemeral] });
                }
            }
        } else {
            await interaction.reply({ content: 'Görevler sıfırlandı. Kanalda güncellenecek bir dağılım mesajı bulunamadı.', flags: [MessageFlags.Ephemeral] });
        }
    },
};