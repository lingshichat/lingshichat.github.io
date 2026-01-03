function fixArchiveTitle() {
    var title = document.querySelector('.article-sort-title');
    if (title && title.innerText.indexOf('篇') === -1) {
        title.innerText += ' 篇';
    }
}

document.addEventListener('DOMContentLoaded', fixArchiveTitle);
document.addEventListener('pjax:complete', fixArchiveTitle);
