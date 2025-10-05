const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { sahiprol, arsivYetkiliRolId } = require('../config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('görevini-sil')
        .setDescription('Bir üyenin aldığı görevleri yönetir ve siler.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addUserOption(option => 
            option.setName('üye')
                .setDescription('Görevleri silinecek üyeyi seçin.')
                .setRequired(true)),
    async execute(interaction, state) {
        const { db, aktifGorevListesi } = state;

        const hasPermission = (rolId) => interaction.user.id === sahiprol || interaction.member.roles.cache.has(rolId);
        if (!hasPermission(arsivYetkiliRolId)) {
            return interaction.reply({ content: 'Bu komutu kullanmak için yetkiniz yok.', flags: [MessageFlags.Ephemeral] });
        }

        const targetUser = interaction.options.getUser('üye');

        // Üyenin aldığı görevleri veritabanından bul
        const userTasks = aktifGorevListesi.filter(task => {
            const gorevData = db.get(`gorev_${task.key}`);
            return gorevData && gorevData.status === 'taken' && gorevData.takenBy === targetUser.id;
        });

        if (userTasks.length === 0) {
            return interaction.reply({ content: `${targetUser.tag} adlı kullanıcının üzerine kayıtlı herhangi bir görev bulunamadı.`, flags: [MessageFlags.Ephemeral] });
        }

        // Görevleri menü seçeneği formatına dönüştür
        const menuOptions = userTasks.map(task => 
            new StringSelectMenuOptionBuilder()
                .setLabel(task.label)
                .setValue(task.key)
                .setDescription(`${targetUser.tag} kullanıcısından bu görevi silmek için seçin.`)
        );

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`gorev_sil_menu_${targetUser.id}`) // Custom ID'ye hedef kullanıcının ID'sini ekliyoruz
            .setPlaceholder('Silmek istediğiniz görevleri seçin...')
            .setMinValues(1)
            .setMaxValues(menuOptions.length) // Birden fazla görev silmeye izin ver
            .addOptions(menuOptions);

        const row = new ActionRowBuilder().addComponents(selectMenu);

        await interaction.reply({
            content: `**${targetUser.tag}** adlı kullanıcının silmek istediğiniz görevlerini aşağıdan seçin:`,
            components: [row],
            flags: [MessageFlags.Ephemeral] // Bu menüyü sadece komutu kullanan kişi görür
        });
    },
};