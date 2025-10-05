const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ButtonBuilder, ButtonStyle, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { gorevListeleri: tumGorevListeleri, groupTasksByTime } = require('../gorev-tanimlari.js');
const { sahiprol, komutYetkiliRolId,botSahipleri } = require('../config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('dağılım')
        .setDescription('Belirtilen tipe göre yeni bir görev dağılım listesi gönderir.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addStringOption(option =>
            option.setName('tip').setDescription('Hangi görev listesinin oluşturulacağını seçin.').setRequired(true)
                .addChoices(
                    { name: 'Hafta İçi', value: 'haftaici' },
                    { name: 'Hafta Sonu (Cuma-Cts)', value: 'haftasonu' },
                    { name: 'Pazar', value: 'pazar' },
                    { name: 'Varsayılan', value: 'varsayilan' }
                )),
    async execute(interaction, state) {
        const { db, logAction } = state;
  if (!botSahipleri.includes(interaction.user.id)) {
            return interaction.reply({ content: 'Bu komutu sadece bot sahipleri kullanabilir.', flags: [MessageFlags.Ephemeral] });
        }

        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const secilenTip = interaction.options.getString('tip');
        const yeniGorevListesi = tumGorevListeleri[secilenTip];

        Object.values(tumGorevListeleri).flat().filter(Boolean).forEach(g => { if (g && g.key) db.delete(`gorev_${g.key}`); });
        Object.keys(db.all()).filter(key => key.startsWith('talep_')).forEach(key => db.delete(key));
        db.set('aktif_gorev_tipi', secilenTip);

        const tipIsimleri = { haftaici: "Hafta İçi", haftasonu: "Hafta Sonu", pazar: "Pazar", varsayilan: "Varsayılan" };
        const aktifTipIsmi = tipIsimleri[secilenTip] || "Bilinmeyen";

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
            .setTitle(`Görev Dağılım Listesi (${aktifTipIsmi})`)
            .setColor('Blue')
            .setFields(fields)
            .setTimestamp();
        
        const components = [];
        const menuOptions = yeniGorevListesi.map(g => new StringSelectMenuOptionBuilder().setLabel(g.label).setValue(g.key).setDescription(g.description));
        if (menuOptions.length > 0) {
            const selectMenu = new StringSelectMenuBuilder().setCustomId('gorev_secim_menu').setPlaceholder('Almak istediğiniz görevleri seçin...').setMinValues(1).setMaxValues(menuOptions.length).addOptions(menuOptions);
            components.push(new ActionRowBuilder().addComponents(selectMenu));
        }
        if (db.has('arsiv') && db.get('arsiv')?.length > 0) {
            components.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('eski_gorevleri_goster').setLabel('Geçmiş Dağılımları Göster').setStyle(ButtonStyle.Secondary)));
        }

        const sentMessage = await interaction.channel.send({ embeds: [embed], components });
        db.set('dagitim_mesaj_id', sentMessage.id);
        
        await interaction.editReply({ content: "Görev dağılım mesajı başarıyla oluşturuldu!" });
        await logAction(interaction.client, "Yeni Görev Dağılımı", `${interaction.user} tarafından **${aktifTipIsmi}** görev listesi başlatıldı.`, "Blue");
    },
};